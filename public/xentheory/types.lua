------------------------------------------------------------
-- Minimal OOP-ish helper (for constructors only)
------------------------------------------------------------
local function class(name)
    local C = {}
    C.__index = C
    C.__name  = name
    return C
end

------------------------------------------------------------
-- Track
-- Pure metadata for routing/synthesis.
-- Fields (suggested):
--   id               (integer/string, optional)
--   name             (string)
--   waveform         (string, e.g., "sine","square","triangle","saw")
--   A4_tuning_hz     (number, optional label)
--   adsr = { A, D, S, R }  (numbers; units per your engine)
--   gain             (number)
------------------------------------------------------------
local Track = class("Track")

function Track:new(args)
    local t = {
        id            = args.id,
        name          = args.name or "Track",
        waveform      = args.waveform or "sine",
        A4_tuning_hz  = args.A4_tuning_hz,   -- optional, engine interprets
        adsr          = args.adsr or { A = 0.01, D = 0.1, S = 0.8, R = 0.1 },
        gain          = args.gain or 1.0,
    }
    return setmetatable(t, Track)
end

------------------------------------------------------------
-- Event
-- Pure data. Engine/preprocessor handles validation & timing.
-- Fields:
--   start_bar          (integer, 1-based)
--   start_division     (integer, 1-based)
--   extra_time_sec     (number, optional fine offset)
--   duration_divisions (integer, optional)
--   duration_sec       (number, optional)
--   divisions_per_bar  (integer, optional per-event override)
--   velocity           (number; 0..1 or 0..127 — your convention)
--   octave             (integer)
--   edo_step           (integer microstep within octave)
--   track_id           (match a Track.id; optional)
------------------------------------------------------------
local Event = class("Event")

function Event:new(args)
    local e = {
        start_bar          = args.start_bar or 1,
        start_division     = args.start_division or 1,
        extra_time_sec     = args.extra_time_sec,

        duration_divisions = args.duration_divisions,
        duration_sec       = args.duration_sec,

        divisions_per_bar  = args.divisions_per_bar,
        velocity           = args.velocity or 1.0,

        octave             = args.octave or 4,
        edo_step           = args.edo_step or 0,

        track_id           = args.track_id,
    }
    return setmetatable(e, Event)
end

------------------------------------------------------------
-- Grid
-- Timing grid + optional EDO preset tag (engine-validated).
-- Fields:
--   start_time_sec            (number)
--   bpm                       (number)
--   bar_length_beats          (number)
--   default_divisions_per_bar (integer)
--   edo_preset                (integer, optional; e.g., 12, 31, 41)
--   events                    (array of Event)
------------------------------------------------------------
local Grid = class("Grid")

function Grid:new(args)
    local g = {
        start_time_sec            = args.start_time_sec or 0.0,
        bpm                       = args.bpm or 120.0,
        bar_length_beats          = args.bar_length_beats or 4,
        default_divisions_per_bar = args.default_divisions_per_bar or 16,
        edo_preset                = args.edo_preset,
        events                    = args.events or {},  -- start empty or prefill
    }
    return setmetatable(g, Grid)
end

------------------------------------------------------------
-- Song
-- Container for global settings, tracks, and grids.
-- No behavior beyond construction.
-- Fields:
--   title               (string)
--   master_gain         (number)
--   default_edo_preset  (integer, optional; fallback for grids)
--   A4_tuning_hz        (number, optional label)
--   tracks              (array of Track)
--   grids               (array of Grid)
------------------------------------------------------------
local Song = class("Song")

function Song:new(args)
    local s = {
        title               = args.title or "Untitled",
        master_gain         = args.master_gain or 1.0,
        default_edo_preset  = args.default_edo_preset, -- engine validates
        A4_tuning_hz        = args.A4_tuning_hz,       -- optional label
        tracks              = args.tracks or {},
        grids               = args.grids or {},
    }
    return setmetatable(s, Song)
end

------------------------------------------------------------
-- Export module
------------------------------------------------------------
return {
    Track = Track,
    Event = Event,
    Grid  = Grid,
    Song  = Song,
}
