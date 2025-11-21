type MaybeCaptureStackTrace = typeof Error & {
    captureStackTrace?: (target: object, ctor?: Function) => void;
};

export class CreateSurgeXTMappingError extends Error {
    constructor(message: string) {
        super(message);

        this.name = "CreateSurgeXTMappingError";

        Object.setPrototypeOf(this, new.target.prototype);

        (Error as MaybeCaptureStackTrace).captureStackTrace?.(this, this.constructor);
    }
}

export type SurgeXTMappingFiles = {
    scl: string;
    kbm: string;
    noteNamesTxt?: string;
};

/**
 * Data model for a Scala `.scl` file describing an EDO scale.
 */
export type SclScaleData = {
    /** Short human‑readable description line. */
    description: string;
    /** Number of notes in the scale (not counting the implicit 1/1). */
    noteCount: number;
    /**
     * Pitch values in cents for each degree above 1/1.
     * Length must equal `noteCount`.
     */
    cents: number[];
};

/**
 * Data model for a Scala `.kbm` keyboard mapping.
 *
 * This is intentionally minimal. For SurgeXT we can use the
 * canonical "linear" mapping with `size = 0`, which means
 * degrees are mapped one‑to‑one across the MIDI range.
 */
export type KbmKeyboardMappingData = {
    /** Size of the mapping pattern. 0 = linear mapping (Scala default). */
    size: number;
    /** First MIDI note number to retune. */
    firstMidiNote: number;
    /** Last MIDI note number to retune. */
    lastMidiNote: number;
    /** MIDI note where scale degree 0 (1/1) is mapped. */
    middleNote: number;
    /** MIDI note for which `referenceFrequency` is given. */
    referenceNote: number;
    /** Frequency in Hz for `referenceNote`. */
    referenceFrequency: number;
    /** Scale degree to consider as the formal octave (0 = last degree). */
    formalOctave: number;
    /** Explicit per-key mapping. Empty when size = 0 (linear). */
    mapping: (number | "x")[];
};

const MIDI_NOTE_COUNT = 128; // 0–127 inclusive

function formatNoteNameFile(
    noteNames: string[],
    edo: number,
    startingOctave: number,
): string {
    if (!noteNames.length) {
        throw new CreateSurgeXTMappingError("noteNames must be a non-empty array when provided");
    }

    const lines: string[] = [];

    for (let midiNote = 0; midiNote < MIDI_NOTE_COUNT; midiNote += 1) {
        const octaveOffset = Math.floor(midiNote / edo);
        const degreeIndex = midiNote % edo;
        const noteName = noteNames[degreeIndex] ?? `Degree${degreeIndex}`;
        const octaveLabel = startingOctave + octaveOffset;

        lines.push(`${midiNote} ${noteName}${octaveLabel}`);
    }

    return lines.join("\n");
}

/** Create the in‑memory representation of an equal‑division‑of‑the‑octave scale. */
export function createEdoSclData(edo: number, description: string): SclScaleData {
    if (!Number.isFinite(edo) || edo <= 0 || !Number.isInteger(edo)) {
        throw new CreateSurgeXTMappingError(`edo must be a positive integer, got ${edo}`);
    }

    const stepCents = 1200 / edo;
    const cents: number[] = [];

    // Conventional EDO SCLs list all degrees up to and including 2/1.
    // So for 12‑EDO this would be 100, 200, ..., 1200.
    for (let degree = 1; degree <= edo; degree += 1) {
        cents.push(stepCents * degree);
    }

    return {
        description,
        noteCount: edo,
        cents,
    };
}

/** Format `SclScaleData` into a Scala `.scl` file string. */
export function formatScl(scale: SclScaleData, fileNameComment = "generated_edo_scale.scl"): string {
    if (scale.cents.length !== scale.noteCount) {
        throw new CreateSurgeXTMappingError(
            `Invalid SCL data: cents length (${scale.cents.length}) does not match noteCount (${scale.noteCount})`,
        );
    }

    const lines: string[] = [];

    // Optional filename/comment header.
    lines.push(`! ${fileNameComment}`);
    lines.push("!");
    lines.push(scale.description);
    lines.push(` ${scale.noteCount}`);
    lines.push("!");

    for (const cents of scale.cents) {
        // Five decimal places is common and more than accurate enough.
        lines.push(` ${cents.toFixed(5)}`);
    }

    return lines.join("\n");
}

/**
 * Create a simple linear KBM mapping suitable for SurgeXT.
 *
 * We:
 *  - map the full MIDI range 0–127;
 *  - place 1/1 (scale degree 0) on middle C (MIDI 60);
 *  - leave tuning neutral (referenceNote = 0, referenceFrequency = 1.0),
 *    because absolute pitch is handled elsewhere (e.g. via C4 frequency).
 */
/**
 * Create a KBM mapping that "packs" only the notes we care about into
 * the lowest part of the MIDI range.
 *
 * We:
 *  - map from MIDI note 0 upward for exactly `requiredMappableNotes` keys;
 *  - map scale degree 0 (our C of `startingOctave`) to MIDI note 0;
 *  - keep tuning neutral (referenceNote = 0, referenceFrequency = 1.0),
 *    since absolute pitch is handled elsewhere.
 */
/**
 * Create a KBM mapping that "packs" only the notes we care about into
 * the lowest part of the MIDI range and fully orients tuning.
 *
 * We:
 *  - map from MIDI note 0 upward for exactly `requiredMappableNotes` keys;
 *  - map scale degree 0 (1/1) to MIDI note 0;
 *  - set referenceNote = 0 and referenceFrequency to the exact frequency
 *    of C(startingOctave), derived from the supplied C4 frequency.
 */
export function createPackedKbmData(
    requiredMappableNotes: number,
    c4Frequency: number,
    startingOctave: number,
): KbmKeyboardMappingData {
    if (!Number.isFinite(requiredMappableNotes) || requiredMappableNotes <= 0 || !Number.isInteger(requiredMappableNotes)) {
        throw new CreateSurgeXTMappingError(
            `requiredMappableNotes must be a positive integer, got ${requiredMappableNotes}`,
        );
    }

    if (requiredMappableNotes > MIDI_NOTE_COUNT) {
        throw new CreateSurgeXTMappingError(
            `requiredMappableNotes (${requiredMappableNotes}) exceeds available MIDI notes (${MIDI_NOTE_COUNT}).`,
        );
    }

    if (!Number.isFinite(c4Frequency) || c4Frequency <= 0) {
        throw new CreateSurgeXTMappingError(`c4Frequency must be a positive number, got ${c4Frequency}`);
    }

    if (!Number.isFinite(startingOctave) || !Number.isInteger(startingOctave)) {
        throw new CreateSurgeXTMappingError(`startingOctave must be an integer, got ${startingOctave}`);
    }

    // Compute the frequency of C(startingOctave) from C4.
    // Each octave step is a factor of 2.
    const octaveOffset = startingOctave - 4;
    const cStartingOctaveFrequency = c4Frequency * Math.pow(2, octaveOffset);

    return {
        size: 0, // 0 => linear mapping over the retuned range
        firstMidiNote: 0,
        lastMidiNote: requiredMappableNotes - 1,
        middleNote: 0, // MIDI 0 is scale degree 0 (1/1)
        referenceNote: 0,
        referenceFrequency: cStartingOctaveFrequency,
        formalOctave: 0,
        mapping: [],
    };
}





/** Format `KbmKeyboardMappingData` into a Scala `.kbm` file string. */
export function formatKbm(mapping: KbmKeyboardMappingData, fileNameComment = "generated_mapping.kbm"): string {
    const lines: string[] = [];

    lines.push(`! ${fileNameComment}`);
    lines.push("! Size of map:");
    lines.push(`${mapping.size}`);
    lines.push("! First MIDI note number to retune:");
    lines.push(`${mapping.firstMidiNote}`);
    lines.push("! Last MIDI note number to retune:");
    lines.push(`${mapping.lastMidiNote}`);
    lines.push("! Middle note where scale degree 0 is mapped to:");
    lines.push(`${mapping.middleNote}`);
    lines.push("! Reference note for which frequency is given:");
    lines.push(`${mapping.referenceNote}`);
    lines.push("! Frequency to tune the above note to (floating point e.g. 440.0):");
    lines.push(`${mapping.referenceFrequency}`);
    lines.push("! Scale degree to consider as formal octave:");
    lines.push(`${mapping.formalOctave}`);
    lines.push("! Mapping.");

    // If size === 0 and mapping is empty, this is a valid "linear" mapping.
    // Otherwise, each entry corresponds to the next higher MIDI key.
    for (const entry of mapping.mapping) {
        lines.push(String(entry));
    }

    return lines.join("\n");
}

/**
 * Creates an scl file usable in SurgeXT.
 * Creates a kbm file that can successfully map all the required notes.
 * Optionally creates a Reaper note name text file when note names are provided
 * in the manifest.
 * If the number of required notes is beyond what MIDI can handle (0–127),
 * then throws a `CreateSurgeXTMappingError`.
 *
 * The absolute tuning (C4 frequency) is precomputed elsewhere; this
 * function only needs it for documentation/traceability in the `.scl`.
 * The `.kbm` it generates fully orients tuning for SurgeXT: it maps MIDI 0
 * to C(startingOctave) and sets its absolute frequency using the
 * provided C4 frequency.
 *
 * @param edo Equal divisions of the octave.
 * @param c4Frequency Frequency of C4 in Hz (precomputed by the caller).
 * @param startingOctave Starting octave in the target EDO whose notes we
 *        conceptually begin mapping from. At present this is used only for
 *        descriptive purposes in the generated `.scl` file.
 * @param octaveCount Number of octaves in the target EDO that we want to
 *        be able to represent uniquely on the MIDI keyboard.
 */
export default function createSurgeXTMappingFiles(
    edo: number,
    c4Frequency: number,
    startingOctave: number,
    octaveCount: number,
    noteNames?: string[],
): SurgeXTMappingFiles {
    const requiredMappableNotes = octaveCount * edo;

    if (!Number.isFinite(octaveCount) || octaveCount <= 0 || !Number.isInteger(octaveCount)) {
        throw new CreateSurgeXTMappingError(
            `octaveCount must be a positive integer, got ${octaveCount}`,
        );
    }

    if (!Number.isFinite(startingOctave) || !Number.isInteger(startingOctave)) {
        throw new CreateSurgeXTMappingError(
            `startingOctave must be an integer, got ${startingOctave}`,
        );
    }

    if (requiredMappableNotes > MIDI_NOTE_COUNT) {
        throw new CreateSurgeXTMappingError(
            `Requested mapping for ${octaveCount} octaves in ${edo}-EDO (` +
                `${requiredMappableNotes} notes) exceeds available MIDI notes (` +
                `${MIDI_NOTE_COUNT}).`,
        );
    }

    const sclData = createEdoSclData(
        edo,
        `${edo}-EDO generated scale (C4 = ${c4Frequency.toFixed(5)} Hz, starting octave = ${startingOctave}, octave count = ${octaveCount})`,
    );

    const kbmData = createPackedKbmData(requiredMappableNotes, c4Frequency, startingOctave);

    const scl = formatScl(sclData);
    const kbm = formatKbm(kbmData);
    const noteNamesTxt = noteNames ? formatNoteNameFile(noteNames, edo, startingOctave) : undefined;

    return { scl, kbm, noteNamesTxt };
}
