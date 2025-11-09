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
------------------------------------------------------------
local Track = class("Track")

function Track:new(args)
    local t = {
        id            = args.id,
        name          = args.name or "Track",
        waveform      = args.waveform or "sine",
        A4_tuning_hz  = args.A4_tuning_hz,   -- optional
        adsr          = args.adsr or { A = 0.01, D = 0.1, S = 0.8, R = 0.1 },
        gain          = args.gain or 1.0,
    }
    return setmetatable(t, Track)
end

------------------------------------------------------------
-- Note
-- Pure musical data. Represents a full note (not MIDI-on/off)
-- Fields:
--   start_bar          (integer, 1-based)
--   start_division     (integer, 1-based)
--   extra_time_sec     (number, optional fine offset)
--   duration_divisions (integer, optional)
--   duration_sec       (number, optional)
--   divisions_per_bar  (integer, optional per-note override)
--   velocity           (number; 0..1 or 0..127 — your convention)
--   octave             (integer)
--   edo_step           (integer microstep within octave)
--   track_id           (match a Track.id; optional)
------------------------------------------------------------
local Note = class("Note")

function Note:new(args)
    local n = {
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
    return setmetatable(n, Note)
end

------------------------------------------------------------
-- Subgrid
-- A timing region placed INSIDE a parent grid (or subgrid) by musical
-- position. Inherits parent's BPM and other defaults unless overridden.
-- Fields:
--   start_bar                 (integer, 1-based)
--   start_division            (integer, 1-based)
--   extra_time_sec            (number, optional fine offset)
--   bar_length_beats          (number, optional; defaults to parent)
--   default_divisions_per_bar (integer, optional; defaults to parent)
--   edo_preset                (integer, optional; defaults to parent)
--   notes                     (array of Note)
--   subgrids                  (array of Subgrid)
------------------------------------------------------------
local Subgrid = class("Subgrid")

function Subgrid:new(args)
    local sg = {
        start_bar                 = args.start_bar or 1,
        start_division            = args.start_division or 1,
        extra_time_sec            = args.extra_time_sec,

        bar_length_beats          = args.bar_length_beats,
        default_divisions_per_bar = args.default_divisions_per_bar,
        edo_preset                = args.edo_preset,

        notes                     = args.notes or {},
        subgrids                  = args.subgrids or {},
    }
    return setmetatable(sg, Subgrid)
end

------------------------------------------------------------
-- Grid
-- Top-level timing grid + optional EDO preset tag (engine-validated).
-- Fields:
--   start_time_sec
--   bpm
--   bar_length_beats
--   default_divisions_per_bar
--   edo_preset
--   notes
--   subgrids
------------------------------------------------------------
local Grid = class("Grid")

function Grid:new(args)
    local g = {
        start_time_sec            = args.start_time_sec or 0.0,
        bpm                       = args.bpm or 120.0,
        bar_length_beats          = args.bar_length_beats or 4,
        default_divisions_per_bar = args.default_divisions_per_bar or 16,
        edo_preset                = args.edo_preset,

        notes                     = args.notes or {},
        subgrids                  = args.subgrids or {},
    }
    return setmetatable(g, Grid)
end

------------------------------------------------------------
-- Song
-- Container for global settings, tracks, and grids.
------------------------------------------------------------
local Song = class("Song")

function Song:new(args)
    local s = {
        title               = args.title or "Untitled",
        master_gain         = args.master_gain or 1.0,
        default_edo_preset  = args.default_edo_preset,
        A4_tuning_hz        = args.A4_tuning_hz,
        tracks              = args.tracks or {},
        grids               = args.grids or {},
    }
    return setmetatable(s, Song)
end

------------------------------------------------------------
-- Export module
------------------------------------------------------------
return {
    Track   = Track,
    Note    = Note,
    Subgrid = Subgrid,
    Grid    = Grid,
    Song    = Song,
}
