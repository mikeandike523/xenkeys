export default function makeSuffixCycle(declaration: Array<[string, string[]]>):string[]{
    const result: string[] = [];
    for(const [prefix, suffixes] of declaration) {
        for(const suffix of suffixes) {
            result.push(`${prefix}${suffix}`);
        }
    }
    return result;
}