from __future__ import annotations

import math
import dataclasses
from dataclasses import dataclass
from typing import List, Sequence, Callable, Optional, Tuple, Dict

import numpy as np
from numpy.typing import NDArray

try:
    import soundfile as sf
except Exception:  # pragma: no cover
    sf = None

from helpers import *


# -------------------------------------------
# Metronome Synth using Noise + Time-Varying Filters
# -------------------------------------------
@dataclass
class MetronomePreset:
    fs: int = 44100
    N: int = 1024
    bpm: float = 120.0
    beats: int = 16  # total beats to render
    accent_every: int = 4  # 4/4 pattern accent on the 1
    seed: Optional[int] = 1234

    # Envelope parameters (seconds)
    attack: float = 0.0015
    decay: float = 0.12
    sustain: float = 0.0
    release: float = 0.06

    # Spectral floor
    base_floor_db: float = -42.0

    # ---- New tone-shaping parameters ----
    # Centers and widths
    accent_center_hz: float = 5200.0
    nonaccent_center_hz: float = 1100.0
    # Bandwidth controls
    accent_bw_dec: float = 0.40  # for raised-cosine; narrower = more pitched
    nonaccent_bw_dec: float = 1.10
    # For log-Gaussian, sigma in decades (FWHM≈2.355*sigma)
    accent_sigma_dec: float = 0.17
    nonaccent_sigma_dec: float = 0.35

    # Peak heights
    accent_peak_db: float = +6.0
    nonaccent_peak_db: float = +1.5

    # Choice of band builder: 'tri', 'cosine', or 'log_gauss'
    band_builder: str = "log_gauss"

    # Post-processing
    hpf_hz: float = 30.0
    drive_db: float = 2.5  # soft-clip drive

    # ---- Pulse tail measurement ----
    # Threshold (dBFS) to consider tail finished; controllable via CLI or code
    tail_threshold_db: float = -55.0
    # RMS window used when measuring tail length (milliseconds)
    tail_rms_window_ms: float = 5.0

    def render(self) -> NDArray[np.floating]:
        rng = np.random.default_rng(self.seed)
        seconds_per_beat = 60.0 / self.bpm
        total_dur = self.beats * seconds_per_beat

        cfg = STFTConfig(fs=self.fs, N=self.N, hop=None)
        pv = PhaseVocoder(cfg)

        # Source: white noise
        x = rng.standard_normal(int(total_dur * self.fs)).astype(float)

        # STFT of source
        X = pv.stft(x)

        # Design time-varying filter via per-beat curves
        def make_curve_fn():
            # Builders map
            def build_band(is_accent: bool, bw_t: float, peak_t: float):
                if is_accent:
                    f0 = self.accent_center_hz
                else:
                    f0 = self.nonaccent_center_hz
                if self.band_builder == "cosine":
                    return make_raised_cosine_band(
                        f_center=f0,
                        bw_dec=bw_t,
                        peak_db=peak_t - self.base_floor_db,
                        floor_db=self.base_floor_db,
                        fs=self.fs,
                    )
                elif self.band_builder == "log_gauss":
                    # Convert desired overall BW to sigma if provided as bw_t
                    # Use sigma ≈ bw_t / 2.355 (FWHM relation) but clamp to avoid ultra-narrow bins
                    sigma = max(0.06, bw_t / 2.355)
                    return make_log_gaussian_curve(
                        f_center=f0,
                        sigma_dec=sigma,
                        peak_db=peak_t - self.base_floor_db,
                        floor_db=self.base_floor_db,
                        fs=self.fs,
                    )
                else:
                    # Fallback to simple triangular 3-point as before
                    f1 = max(20.0, f0 / (10 ** (bw_t / 2)))
                    f3 = min(self.fs / 2 - 1.0, f0 * (10 ** (bw_t / 2)))
                    pts = [
                        (20.0, self.base_floor_db),
                        (f1, self.base_floor_db),
                        (f0, peak_t),
                        (f3, self.base_floor_db),
                        (self.fs / 2 - 1.0, self.base_floor_db),
                    ]
                    return LogLogCurve(pts)

            def curve_at_time(t: float) -> LogLogCurve:
                seconds_per_beat = 60.0 / self.bpm
                beat_idx = int(t // seconds_per_beat)
                beat_pos = (t - beat_idx * seconds_per_beat) / seconds_per_beat
                is_accent = beat_idx % self.accent_every == 0

                # Time decay -> narrow and fade
                base_bw = self.accent_bw_dec if is_accent else self.nonaccent_bw_dec
                base_peak = self.accent_peak_db if is_accent else self.nonaccent_peak_db
                decay = math.exp(-4.0 * beat_pos)
                bw_t = max(0.18, base_bw * (0.6 + 0.4 * decay))
                peak_t = self.base_floor_db + (base_peak) * decay

                # Build tapered/narrow band
                return build_band(is_accent, bw_t, peak_t)

            return curve_at_time

        tv_filter = TimeVaryingFilter(make_curve_fn(), cfg)
        Y = tv_filter.apply(X)

        # ISTFT
        y = pv.istft(Y, out_len=len(x))

        # Apply simple ADSR on amplitude across each beat for more click-like feel
        seconds_per_beat = 60.0 / self.bpm
        y = self._apply_per_beat_adsr(y, seconds_per_beat)

        # Post-processing: HPF + soft clip, then normalize
        y = self._one_pole_hpf(y, self.hpf_hz)
        y = self._soft_clip_tanh(y, self.drive_db)

        peak = np.max(np.abs(y)) + 1e-12
        y = 0.9 * y / peak
        return y.astype(np.float32)

    # --- Pulse extraction helpers ---
    def _measure_tail_samples(
        self,
        x: NDArray[np.floating],
        threshold_db: Optional[float] = None,
        rms_window_ms: Optional[float] = None,
    ) -> int:
        """Return number of samples from the max onward until RMS falls below threshold.
        Uses moving RMS with a short window to provide a stable measure.
        """
        if threshold_db is None:
            threshold_db = self.tail_threshold_db
        if rms_window_ms is None:
            rms_window_ms = self.tail_rms_window_ms

        # Convert to linear
        thr = 10 ** (threshold_db / 20.0)
        w = max(1, int(self.fs * (rms_window_ms * 1e-3)))
        # Moving RMS of absolute signal
        x2 = np.square(x.astype(float))
        win = np.ones(w, dtype=float) / w
        # Same-length convolution (pad at end)
        rms = np.sqrt(np.convolve(x2, win, mode="same"))

        # Start at the global peak
        i0 = int(np.argmax(np.abs(x)))
        # Find first index >= i0 where RMS < thr
        below = np.nonzero(rms[i0:] < thr)[0]
        if below.size == 0:
            return len(x)  # never fell below; return full length
        return int(below[0])

    def _extract_first_pulse(
        self,
        y: NDArray[np.floating],
        is_accent: bool,
    ) -> NDArray[np.floating]:
        spb = 60.0 / self.bpm
        n_per_beat = int(spb * self.fs)
        # Choose first accent (beat 0) or first nonaccent (beat 1)
        beat_index = 0 if is_accent else 1
        start = beat_index * n_per_beat
        end = min(len(y), start + n_per_beat)
        seg = y[start:end]
        # Measure tail and trim
        tail_n = self._measure_tail_samples(seg)
        cut = min(len(seg), tail_n + 1)  # include sample that crosses below
        pulse = seg[:cut].copy()
        # Apply a short fade-out to avoid clicks at the trim point
        fade_len = min(int(0.002 * self.fs), max(8, int(0.0005 * self.fs)))
        if len(pulse) > fade_len:
            fade = np.linspace(1.0, 0.0, fade_len, endpoint=True)
            pulse[-fade_len:] *= fade
        return pulse.astype(np.float32)

    def render_and_save_pulses(
        self,
        prefix: str = "metclick",
        write_files: bool = True,
        override_threshold_db: Optional[float] = None,
    ) -> Tuple[Dict[str, str], Dict[str, float]]:
        """Render the full metronome once, then extract and (optionally) save
        representative accent and nonaccent pulses trimmed at the measured tail.

        Returns (paths, durations_seconds)
        """
        y = self.render()
        # Optionally override just for this measurement
        if override_threshold_db is not None:
            old = self.tail_threshold_db
            try:
                self.tail_threshold_db = override_threshold_db
                accent = self._extract_first_pulse(y, True)
                nonaccent = self._extract_first_pulse(y, False)
            finally:
                self.tail_threshold_db = old
        else:
            accent = self._extract_first_pulse(y, True)
            nonaccent = self._extract_first_pulse(y, False)

        paths: Dict[str, str] = {}
        durs: Dict[str, float] = {
            "accent": len(accent) / self.fs,
            "nonaccent": len(nonaccent) / self.fs,
        }

        if write_files:
            if sf is None:
                raise RuntimeError(
                    "soundfile library not available. Please install `pip install soundfile`."
                )
            acc_path = f"{prefix}_accent.wav"
            non_path = f"{prefix}_nonaccent.wav"
            sf.write(acc_path, accent, self.fs, subtype="PCM_16")
            sf.write(non_path, nonaccent, self.fs, subtype="PCM_16")
            paths["accent"] = acc_path
            paths["nonaccent"] = non_path

        return paths, durs

    # --- ADSR & post chain ---
    def _adsr_envelope(self, n: int) -> NDArray[np.floating]:
        a = int(self.attack * self.fs)
        d = int(self.decay * self.fs)
        r = int(self.release * self.fs)
        s_len = max(0, n - (a + d + r))
        env = np.zeros(n, dtype=float)
        if a > 0:
            env[:a] = np.linspace(0, 1, a, endpoint=False)
        else:
            env[0] = 1.0
        if d > 0:
            env[a : a + d] = np.linspace(1, self.sustain, d, endpoint=False)
        else:
            env[a : a + 1] = self.sustain
        if s_len > 0:
            env[a + d : a + d + s_len] = self.sustain
        if r > 0:
            env[a + d + s_len : a + d + s_len + r] = np.linspace(
                self.sustain, 0.0, r, endpoint=True
            )
        if a + d + s_len + r < n:
            env[a + d + s_len + r :] = 0.0
        return env

    def _apply_per_beat_adsr(
        self, y: NDArray[np.floating], spb: float
    ) -> NDArray[np.floating]:
        n_per_beat = int(spb * self.fs)
        env = np.zeros_like(y)
        for b in range(self.beats):
            start = b * n_per_beat
            end = min(len(y), start + n_per_beat)
            e = self._adsr_envelope(end - start)
            env[start:end] = e
        return y * env

    # --- Post chain ---
    def _one_pole_hpf(self, x: NDArray[np.floating], fc: float) -> NDArray[np.floating]:
        if fc <= 0:
            return x
        dt = 1.0 / self.fs
        rc = 1.0 / (2.0 * np.pi * fc)
        alpha = rc / (rc + dt)
        y = np.zeros_like(x)
        x_prev = 0.0
        y_prev = 0.0
        for n in range(len(x)):
            y[n] = alpha * (y_prev + x[n] - x_prev)
            x_prev = x[n]
            y_prev = y[n]
        return y

    def _soft_clip_tanh(
        self, x: NDArray[np.floating], drive_db: float
    ) -> NDArray[np.floating]:
        g = 10 ** (drive_db / 20.0)
        if g <= 1.0:
            return x
        y = np.tanh(g * x)
        return y / np.tanh(g)


# -------------------------------------------
# Convenience API
# -------------------------------------------

def synth_metronome(
    outfile: str = "metronome.wav",
    fs: int = 44100,
    N: int = 1024,
    bpm: float = 120.0,
    beats: int = 16,
    accent_every: int = 4,
    seed: Optional[int] = 1234,
    # New optional controls
    pulses_prefix: Optional[str] = None,
    tail_threshold_db: Optional[float] = None,
) -> Tuple[str, NDArray[np.floating]]:
    """Render the full metronome to `outfile` and (optionally) also write
    trimmed accent/nonaccent pulses using a tail threshold.

    Returns (outfile_path, full_signal)
    """
    preset = MetronomePreset(
        fs=fs,
        N=N,
        bpm=bpm,
        beats=beats,
        accent_every=accent_every,
        seed=seed,
        # Envelope parameters (seconds)
        attack=0.0015,
        decay=0.080,
        sustain=0,
        release=0.06,
        # Spectral floor
        base_floor_db=-60,
        # ---- New tone-shaping parameters ----
        # Centers and widths
        accent_center_hz=5500.0,
        nonaccent_center_hz=750.0,
        # For log-Gaussian, sigma in decades (FWHM≈2.355*sigma)
        accent_sigma_dec=0.2,
        nonaccent_sigma_dec=0.4,
        # Peak heights
        accent_peak_db=+60,
        nonaccent_peak_db=+48.5,
        # Choice of band builder: 'tri', 'cosine', or 'log_gauss'
        band_builder="log_gauss",
        # Post-processing
        hpf_hz=40,
        drive_db=0,  # soft-clip drive
        # ---- Pulse tail measurement (added to preset as requested) ----
        tail_threshold_db=(tail_threshold_db if tail_threshold_db is not None else -55.0),
        tail_rms_window_ms=5.0,
    )

    y = preset.render()
    if sf is None:
        raise RuntimeError(
            "soundfile library not available. Please install `pip install soundfile`."
        )
    sf.write(outfile, y, fs, subtype="PCM_16")

    # Optionally save separate pulses
    if pulses_prefix is not None:
        preset.render_and_save_pulses(prefix=pulses_prefix, write_files=True,
                                      override_threshold_db=tail_threshold_db)

    return outfile, y


# -------------------------------------------
# CLI
# -------------------------------------------
if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(
        description="Metronome Noise Synth (Phase-Vocoder, Log-Log Filters)"
    )
    p.add_argument(
        "--outfile", type=str, default="metronome.wav", help="Output WAV file path"
    )
    p.add_argument("--fs", type=int, default=44100, help="Sample rate")
    p.add_argument("--N", type=int, default=1024, help="FFT size (even)")
    p.add_argument("--bpm", type=float, default=120.0, help="Beats per minute")
    p.add_argument("--beats", type=int, default=16, help="Number of beats to render")
    p.add_argument(
        "--accent-every", type=int, default=4, help="Accent period (e.g., 4 for 4/4)"
    )
    p.add_argument("--seed", type=int, default=1234, help="RNG seed")

    # New CLI controls for pulse saving & tail detection
    p.add_argument(
        "--pulses-prefix",
        type=str,
        default=None,
        help=(
            "If set, also write trimmed pulses to '<prefix>_accent.wav' and "
            "'<prefix>_nonaccent.wav'."
        ),
    )
    p.add_argument(
        "--tail-threshold-db",
        type=float,
        default=None,
        help=(
            "dBFS threshold (e.g., -55) used to measure/trim pulse tail. "
            "If omitted, preset's default is used."
        ),
    )

    args = p.parse_args()
    path, _ = synth_metronome(
        outfile=args.outfile,
        fs=args.fs,
        N=args.N,
        bpm=args.bpm,
        beats=args.beats,
        accent_every=args.__dict__["accent_every"],
        seed=args.seed,
        pulses_prefix=args.pulses_prefix,
        tail_threshold_db=args.tail_threshold_db,
    )
    print(f"Wrote {path}")
    if args.pulses_prefix:
        print(
            f"Also wrote {args.pulses_prefix}_accent.wav and {args.pulses_prefix}_nonaccent.wav"
        )
