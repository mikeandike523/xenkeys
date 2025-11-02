from __future__ import annotations

from dataclasses import dataclass
from typing import List, Callable, Optional, Tuple

import numpy as np
from numpy.typing import NDArray



# -------------------------------------------
# Utility helpers
# -------------------------------------------

def db_to_linear(db: NDArray[np.floating] | float) -> NDArray[np.floating] | float:
    return 10.0 ** (np.array(db, dtype=float) / 20.0)


def safe_clip(x: NDArray[np.floating], eps: float = 1e-12) -> NDArray[np.floating]:
    return np.maximum(x, eps)


# -------------------------------------------
# STFT / ISTFT (Phase Vocoder Core)
# -------------------------------------------
@dataclass
class STFTConfig:
    fs: int = 44100
    N: int = 1024
    hop: Optional[int] = None  # default N//2 if None

    def __post_init__(self):
        if self.hop is None:
            self.hop = self.N // 2
        if self.N % 2 != 0:
            raise ValueError("N must be even to include Nyquist bin.")
        if self.hop <= 0 or self.hop > self.N:
            raise ValueError("Invalid hop size.")

    @property
    def window(self) -> NDArray[np.floating]:
        # Hann window for both analysis and reconstruction
        return np.hanning(self.N).astype(float)

    @property
    def freq_bins_hz(self) -> NDArray[np.floating]:
        # Center frequencies (0..N/2 inclusive)
        return np.fft.rfftfreq(self.N, d=1.0 / self.fs)


class PhaseVocoder:
    """Generalized phase-vocoder style STFT/ISTFT with Hann windows and hop=N/2.

    Linear-phase filtering is achieved by multiplying each frame spectrum X[k, m]
    by a complex H[k, m] that carries a fixed linear phase corresponding to a
    group delay of exactly N/2 samples. The magnitude of H is obtained from a
    user-defined log–log filter curve; Hermitian symmetry is enforced by
    operating on rfft/irfft domains.
    """

    def __init__(self, cfg: STFTConfig):
        self.cfg = cfg
        self.win = cfg.window
        self.hop = cfg.hop
        # Precompute synthesis compensation for COLA
        self.win_sq = self.win ** 2

    def stft(self, x: NDArray[np.floating]) -> NDArray[np.complexfloating]:
        N, H = self.cfg.N, self.hop
        w = self.win
        # Pad so frames are centered; interpret first frame centered at N/2
        pad = N // 2
        x_pad = np.pad(x, (pad, pad + (N - (len(x) + pad) % H) % H), mode='constant')
        n_frames = 1 + (len(x_pad) - N) // H
        X = np.empty((n_frames, N // 2 + 1), dtype=np.complex128)
        for m in range(n_frames):
            start = m * H
            frame = x_pad[start:start + N] * w
            X[m, :] = np.fft.rfft(frame)
        return X

    def istft(self, X: NDArray[np.complexfloating], out_len: Optional[int] = None) -> NDArray[np.floating]:
        N, H = self.cfg.N, self.hop
        w = self.win
        n_frames = X.shape[0]
        # Output with the same centering (remove pad at the end)
        total_len = n_frames * H + N
        y = np.zeros(total_len, dtype=float)
        norm = np.zeros(total_len, dtype=float)
        for m in range(n_frames):
            start = m * H
            frame_t = np.fft.irfft(X[m, :], n=N).real
            y[start:start + N] += frame_t * w
            norm[start:start + N] += self.win_sq
        # Avoid divide-by-zero
        nz = norm > 1e-8
        y[nz] /= norm[nz]
        # Remove the centering pad
        pad = N // 2
        y = y[pad:]
        if out_len is not None:
            y = y[:out_len]
        return y


# -------------------------------------------
# Log–Log Filter Curve + Builders
# -------------------------------------------
@dataclass
class LogLogCurve:
    """Piecewise-linear curve defined in log10(frequency) vs amplitude (dB).

    points: sequence of (freq_hz, amp_db). Frequencies must be > 0 and strictly
    increasing. Interpolation is linear in x=log10(f Hz) and y=dB. Out-of-range
    extrapolation clamps to endpoints.
    """
    points: List[Tuple[float, float]]

    def __post_init__(self):
        xs = [p[0] for p in self.points]
        if any(f <= 0 for f in xs):
            raise ValueError("Frequencies must be > 0.")
        if any(xs[i] >= xs[i + 1] for i in range(len(xs) - 1)):
            raise ValueError("Frequencies must be strictly increasing.")
        self._logx = np.log10(np.array(xs, dtype=float))
        self._y_db = np.array([p[1] for p in self.points], dtype=float)

    def eval_db(self, f_hz: NDArray[np.floating]) -> NDArray[np.floating]:
        x = np.log10(safe_clip(np.asarray(f_hz, dtype=float), 1e-12))
        return np.interp(x, self._logx, self._y_db, left=self._y_db[0], right=self._y_db[-1])

    def eval_mag(self, f_hz: NDArray[np.floating]) -> NDArray[np.floating]:
        return db_to_linear(self.eval_db(f_hz))


def make_log_gaussian_curve(
    f_center: float,
    sigma_dec: float,
    peak_db: float,
    floor_db: float,
    fs: int,
    n_points: int = 256,
) -> LogLogCurve:
    """Builds a smooth, narrow/wide bandpass using a *log-frequency Gaussian*.

    In log10(f) domain: gain_db(f) = floor_db + peak_db * exp(-0.5 * (log10(f/f0)/sigma_dec)^2)
    - `sigma_dec` controls width in decades. FWHM (decades) = 2*sqrt(2*ln 2) * sigma_dec.
    - `peak_db` is the height above `floor_db` at f0.
    """
    fmin = 20.0
    fmax = fs / 2 - 1.0
    freqs = np.logspace(np.log10(fmin), np.log10(fmax), n_points)
    x = np.log10(freqs / f_center)
    env = floor_db + peak_db * np.exp(-0.5 * (x / sigma_dec) ** 2)
    pts = list(zip(freqs.tolist(), env.tolist()))
    return LogLogCurve(pts)


def make_raised_cosine_band(
    f_center: float,
    bw_dec: float,
    peak_db: float,
    floor_db: float,
    fs: int,
    n_points: int = 256,
) -> LogLogCurve:
    """Raised-cosine (Hann-like) band in log-frequency with tapered sides.

    gain_db(f) = floor_db + peak_db * 0.5 * (1 + cos(pi * u)), for |u|<=1, else floor_db
    where u = log10(f/f_center) / (bw_dec/2).
    """
    fmin = 20.0
    fmax = fs / 2 - 1.0
    freqs = np.logspace(np.log10(fmin), np.log10(fmax), n_points)
    u = np.log10(freqs / f_center) / (bw_dec / 2.0)
    inside = np.abs(u) <= 1.0
    env = np.full_like(freqs, floor_db)
    env[inside] = floor_db + peak_db * 0.5 * (1.0 + np.cos(np.pi * u[inside]))
    pts = list(zip(freqs.tolist(), env.tolist()))
    return LogLogCurve(pts)

# -------------------------------------------
# Time-Varying Filter Factory
# -------------------------------------------
@dataclass
class TimeVaryingFilter:
    """Provides H[k, m] magnitudes over frames from time-varying log–log curves.

    curve_fn: Callable taking (t_seconds) and returning a LogLogCurve.
    """
    curve_fn: Callable[[float], LogLogCurve]
    cfg: STFTConfig

    def linear_phase_response(self) -> NDArray[np.floating]:
        """Phase for linear-phase with group delay N/2 samples: phi[k] = -2πk*(N/2)/N = -π k"""
        N = self.cfg.N
        k = np.arange(0, N // 2 + 1)
        return -np.pi * k

    def magnitudes_for_bins(self, curve: LogLogCurve) -> NDArray[np.floating]:
        return curve.eval_mag(self.cfg.freq_bins_hz)

    def frame_filter(self, t_sec: float) -> NDArray[np.complexfloating]:
        mag = self.magnitudes_for_bins(self.curve_fn(t_sec))
        phase = self.linear_phase_response()
        H = mag * np.exp(1j * phase)
        return H

    def apply(self, X: NDArray[np.complexfloating]) -> NDArray[np.complexfloating]:
        H_all = np.empty_like(X)
        hop = self.cfg.hop
        for m in range(X.shape[0]):
            t_sec = (m * hop) / self.cfg.fs
            H = self.frame_filter(t_sec)
            H_all[m, :] = H
        return X * H_all