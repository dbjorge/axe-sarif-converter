#!/usr/bin/env node
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as fs from 'fs';
import { Log } from 'sarif';
import * as yargs from 'yargs';
import { convertAxeToSarif, ConverterOptions } from '.';
import { applyBaselineFile } from './baseline';

type Arguments = {
    'input-files': string[];
    'output-file': string;
    'baseline-file'?: string;
    verbose: boolean;
    pretty: boolean;
    force: boolean;
};

const argv: Arguments = yargs
    .scriptName('axe-sarif-converter')
    .version() // inferred from package.json
    .usage(
        '$0: Converts JSON files containing axe-core Result object(s) into SARIF files',
    )
    .example('$0 -i axe-results.json -o axe-results.sarif', '')
    .option('input-files', {
        alias: 'i',
        describe:
            'Input JSON file(s) containing axe-core Result object(s). Does not support globs. Each input file may consist of either a single root-level axe-core Results object or a root-level array of axe-core Results objects.',
        demandOption: true,
        type: 'string',
    })
    .array('input-files')
    .option('output-file', {
        alias: 'o',
        describe:
            'Output SARIF file. Multiple input files (or input files containing multiple Result objects) will be combined into one output file with a SARIF Run per axe-core Result.',
        demandOption: true,
        type: 'string',
    })
    .option('baseline-file', {
        alias: 'b',
        describe:
            'Baseline SARIF file. If specified, results in the output SARIF file will be annotated with a baselineState property. Should correspond to a past output file from the same version/options of this tool.',
        type: 'string',
    })
    .option('verbose', {
        alias: 'v',
        describe: 'Enables verbose console output.',
        default: false,
        type: 'boolean',
    })
    .option('pretty', {
        alias: 'p',
        describe: 'Includes line breaks and indentation in the output.',
        default: false,
        type: 'boolean',
    })
    .option('force', {
        alias: 'f',
        describe: 'Overwrites the output file if it already exists.',
        default: false,
        type: 'boolean',
    }).argv;

const verboseLog = argv.verbose ? console.log : () => {};

// We intentionally omit baselineFile because in the multiple-input-file case,
// we want to invoke applyBaselineFile over the combined log rather than each
// individual log
const converterOptions: ConverterOptions = {};

function exitWithErrorMessage(message: string) {
    console.error(message);
    process.exit(1);
}

function flatten<T>(nestedArray: T[][]): T[] {
    return nestedArray.reduce(
        (accumulator, next) => accumulator.concat(next),
        [],
    );
}

const sarifLogs: Log[] = flatten(
    argv['input-files'].map((inputFilePath, index) => {
        verboseLog(
            `Reading input file ${index + 1}/${
                argv['input-files'].length
            } ${inputFilePath}`,
        );

        // tslint:disable-next-line: non-literal-fs-path
        const rawInputFileContents = fs.readFileSync(inputFilePath);
        const inputFileJson = JSON.parse(rawInputFileContents.toString());
        if (Array.isArray(inputFileJson)) {
            // Treating as array of axe results, like axe-cli produces
            return inputFileJson.map(input =>
                convertAxeToSarif(input, converterOptions),
            );
        } else {
            // Treating as a single axe results object, like
            // JSON.stringify(await axe.run(...)) would produce
            return [convertAxeToSarif(inputFileJson, converterOptions)];
        }
    }),
);

verboseLog(`Aggregating converted input file(s) into one SARIF log`);
let combinedLog: Log = {
    ...sarifLogs[0],
    runs: flatten(sarifLogs.map(log => log.runs)),
};

if (argv['baseline-file'] != undefined) {
    verboseLog('Applying baseline file to aggregated SARIF log');
    combinedLog = applyBaselineFile(combinedLog, argv['baseline-file']);
}

verboseLog(`Formatting SARIF data into file contents`);
const jsonSpacing = argv.pretty ? 2 : undefined;
const outputFileContent = JSON.stringify(combinedLog, null, jsonSpacing);

verboseLog(`Writing output file ${argv['output-file']}`);
try {
    // tslint:disable-next-line: non-literal-fs-path
    fs.writeFileSync(argv['output-file'], outputFileContent, {
        flag: argv.force ? 'w' : 'wx',
    });
} catch (e) {
    if (e.code == 'EEXIST') {
        exitWithErrorMessage(
            `Error: EEXIST: Output file ${argv['output-file']} already exists. Did you mean to use --force?`,
        );
    } else {
        throw e;
    }
}

verboseLog(`Done`);
