export default function iota(N: number): number[] {
    return new Array(N).fill(null).map((_, i) => i);
}