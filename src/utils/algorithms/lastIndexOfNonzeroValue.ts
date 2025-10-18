export default function lastIndexOfNonzeroValue(arr: number[]): number | null {
    for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i]!== 0) {
            return i;
        }
    }
    return null
}