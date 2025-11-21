export type KeyClass = {
    /**
     * 
     * If it is the top level key-class:
     *      The fraction of the full octave display width that the key is
     * 
     * If it second level or lower:
     *      Fraction of the width of the previous key-class 
     */
    widthFraction: number

    /**
     * If it is the top level key-class:
     *      The fraction of the full octave display height that the key is
     * 
     * If it second level or lower:
     *     Fraction of the height of the previous key-class
     */
    heightFraction: number

    /*
     * Color when not pressed
     */
    baseColor: string

    /*
     * Color when pressed
     */
    pressedColor: string

    outlineColor: string

    outlineThickness: number
}

export type KeyDeclaration = {
    /**
     * A list of positional offsets according to each key-class.
     */
    offsets: Array<number>
    /**
     * Number of vertical sub-keys to split into
     */
    divisions: number
    /**
     * Starting micro-step (one division of the EDO)
     * 
     * If divisions > 1, then the key spans more than one micro-step and the UI
     * Will compute the offset of each sub-key when processing events
     * 
     */
    microStepOffset: number
    /**
     * Which key-class this key declaration belongs to
     */
    classIndex: number
}

export default interface XenOctaveDisplayManifest {
    keyClasses: Array<KeyClass>
    keyDeclarations: Array<KeyDeclaration>
    totalEDO: number
    C4Frequency: number
    noteNames?: string[]
}