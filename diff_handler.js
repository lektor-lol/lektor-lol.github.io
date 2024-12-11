export class DiffHandler {
    constructor() {
        this.dmp = new diff_match_patch();
    }

    computeDiff(text1, text2) {
        const diff = this.dmp.diff_main(text1, text2);
        this.dmp.diff_cleanupSemantic(diff);
        return diff;
    }

    acceptEditByIndex(diff, indexIns, indexDel) {
        indexIns = parseInt(indexIns);
        indexDel = parseInt(indexDel);
        
        let newDiff = [];
        diff.forEach((part, i) => {
            if (i === indexDel) return;
            if (i === indexIns) {
                newDiff.push([0, part[1]]);
                return;
            }
            newDiff.push(part);
        });
        return newDiff;
    }

    rejectEditByIndex(diff, indexIns, indexDel) {
        return this.acceptEditByIndex(diff, indexDel, indexIns);
    }

    acceptAllEdits(diff) {
        return diff.reduce((newDiff, part) => {
            if (part[0] === 1) {
                newDiff.push([0, part[1]]);
            } else if (part[0] === 0) {
                newDiff.push(part);
            }
            return newDiff;
        }, []);
    }

    rejectAllEdits(diff) {
        return diff.reduce((newDiff, part) => {
            if (part[0] === -1) {
                newDiff.push([0, part[1]]);
            } else if (part[0] === 0) {
                newDiff.push(part);
            }
            return newDiff;
        }, []);
    }
} 