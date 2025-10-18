/**
 * 
 * src/worklets/extra-glue-types.d.ts
 * 
 * Define some glue types that weren't even present in the @types/audioworklet package.
 */

export interface AudioParamDescriptor {
    name: string
    automationRate?: 'a-rate' | 'k-rate'
    defaultValue?: number
    minValue?: number
    maxValue?: number
}

// Idiomatic dead code to indicate
// module-mode of .d.ts file
// i.e. not auto-ambient-dec
// Not necessary since we already export at least one thing
// But it's good practice
export {}