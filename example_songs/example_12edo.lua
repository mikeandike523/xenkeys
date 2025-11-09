XenTypes = require("public.xentheory.types")

lead_track = XenTypes.Track:new({
    id = 1,
    name = "Lead Track",
    waveform = "sine",
    A4_tuning_hz = 440,
    adsr = { A = 0.01, D = 0.1, S = 0.8, R = 0.1 },
    gain = 1.0

})

song = XenTypes.Song:new({
    title = "12edo Example",
    tracks = { lead_track },
    grids = {},
    master_gain = 0.3
})

return song