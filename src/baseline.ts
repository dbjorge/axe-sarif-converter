// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as sarifMultitoolPath from '@microsoft/sarif-multitool';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as Sarif from 'sarif';

export function applyBaselineFile(
    results: Sarif.Log,
    baselineFile: string,
): Sarif.Log {
    const tmpDirPrefix = path.join(os.tmpdir(), 'axe-sarif-converter-baseline');
    const tmpDir = fs.mkdtempSync(tmpDirPrefix);
    const originalResultsFile = path.join(tmpDir, 'original-results.sarif');
    const annotatedResultsFile = path.join(tmpDir, 'annotated-results.sarif');

    fs.writeFileSync(originalResultsFile, JSON.stringify(results), {
        encoding: 'utf8',
    });

    const multitoolOutput = spawnSync(sarifMultitoolPath, [
        'match-results-forward',
        '--previous',
        baselineFile,
        '--output-file-path',
        annotatedResultsFile,
        originalResultsFile,
    ]);
    if (multitoolOutput.error != null) {
        throw new Error(
            'Error occurred while executing SARIF Multitool to perform baselining: ' +
                multitoolOutput.error.message,
        );
    }
    if (multitoolOutput.status !== 0) {
        throw new Error(
            `SARIF Multitool failed with exit code ${multitoolOutput.status}. Full output:\n${multitoolOutput.stdout}`,
        );
    }

    const rawAnnotatedResultsContent = fs.readFileSync(annotatedResultsFile, {
        encoding: 'utf8',
    });

    const annotatedResults = JSON.parse(
        rawAnnotatedResultsContent,
    ) as Sarif.Log;

    fs.rmdirSync(tmpDir, { recursive: true });

    return annotatedResults;
}
