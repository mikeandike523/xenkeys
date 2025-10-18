/**
 * Define some glue types that weren't even present in the @types/audioworklet package.
 */

export interface AudioParamDescriptor {
    name: string
    automationRate?: 'a-rate' | 'k-rate'
    defaultValue?: number
    minValue?: number
    maxValue?: number
}