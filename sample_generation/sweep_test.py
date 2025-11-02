import numpy as np
import soundfile as sf

from helpers import STFTConfig, PhaseVocoder, TimeVaryingFilter, make_raised_cosine_band

# Params
fs = 44100
duration_sec = 8.0
N = 1024  # even required
cfg = STFTConfig(fs=fs, N=N)  # hop defaults to N//2

# Source white noise
rng = np.random.default_rng(0)
x = rng.standard_normal(int(fs * duration_sec)).astype(float)
x *= 0.2  # scale down

# Define a log sweep of the band center from 100 Hz to 10 kHz across the clip
f_start = 100.0
f_end = 10000.0

def f_center(t):
    # exponential (log) sweep
    return f_start * (f_end / f_start) ** (t / duration_sec)

# Build the time-varying filter using a raised-cosine band in log-frequency
# Bandwidth: 0.6 decades (~4x in frequency) with -30 dB floor outside the band
bw_dec = 0.6
peak_db = 60
floor_db = -60

def curve_fn(t_sec):
    return make_raised_cosine_band(
        f_center=f_center(t_sec),
        bw_dec=bw_dec,
        peak_db=peak_db,
        floor_db=floor_db,
        fs=fs,
        n_points=256,
    )

tvf = TimeVaryingFilter(curve_fn=curve_fn, cfg=cfg)

# STFT -> apply filter -> ISTFT
pv = PhaseVocoder(cfg)
X = pv.stft(x)
Xf = tvf.apply(X)
y = pv.istft(Xf, out_len=len(x))

# Normalize to prevent clipping but preserve relative loudness
peak = np.max(np.abs(y))
if peak > 0:
    y = (y / peak) * 0.95

out_path = 'white_noise_bandpass_sweep.wav'
sf.write(out_path, y, fs, subtype='PCM_16')

# Provide a couple of quick stats that might help sanity-check
duration = len(y) / fs
min_val = float(y.min())
max_val = float(y.max())
rms = float(np.sqrt(np.mean(y**2)))

(out_path, {"duration_sec": duration, "min": min_val, "max": max_val, "rms": rms})