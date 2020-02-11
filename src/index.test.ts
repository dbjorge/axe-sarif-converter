// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import {
    AxeResults,
    Result,
    RunOptions,
    TestEngine,
    TestEnvironment,
    TestRunner,
} from 'axe-core';
import * as fs from 'fs';
import * as path from 'path';
import { AxeRawResult } from './axe-raw-result';
import { convertAxeToSarif, SarifLog, sarifReporter } from './index';
import { testResourceTimestampPlaceholder } from './test-resource-constants';

function testResourceFilePath(testResourceFileName: string): string {
    return path.join('./src/test-resources', testResourceFileName);
}

function readTestResourceJSON(testResourceFileName: string): any {
    const rawFileContents: string = fs.readFileSync(
        // Allowing for test-only code
        // tslint:disable-next-line: non-literal-fs-path
        testResourceFilePath(testResourceFileName),
        'utf8',
    );
    return JSON.parse(rawFileContents);
}

describe('public convertAxeToSarif API', () => {
    it('converts minimal axe v2 input with no results to the pinned minimal SARIF output', () => {
        // "Minimal" means "just enough for the converter to infer required EnvironmentData"
        const minimalAxeV2Input: AxeResults = {
            toolOptions: {} as RunOptions,
            testEngine: {
                version: '1.2.3',
            } as TestEngine,
            testRunner: {} as TestRunner,
            testEnvironment: {} as TestEnvironment,
            url: 'https://example.com',
            timestamp: '2018-03-23T21:36:58.321Z',
            passes: [] as Result[],
            violations: [] as Result[],
            incomplete: [] as Result[],
            inapplicable: [] as Result[],
        };

        expect(convertAxeToSarif(minimalAxeV2Input)).toMatchSnapshot();
    });

    it.each`
        inputFile                                     | outputFile
        ${'basic-axe-v3.2.2.reporter-v2.json'}        | ${'basic-axe-v3.2.2.sarif'}
        ${'w3citylights-axe-v3.2.2.reporter-v2.json'} | ${'w3citylights-axe-v3.2.2.sarif'}
        ${'basic-axe-v3.3.2.reporter-v1.json'}        | ${'basic-axe-v3.3.2.sarif'}
        ${'basic-axe-v3.3.2.reporter-v2.json'}        | ${'basic-axe-v3.3.2.sarif'}
        ${'w3citylights-axe-v3.3.2.reporter-v1.json'} | ${'w3citylights-axe-v3.3.2.sarif'}
        ${'w3citylights-axe-v3.3.2.reporter-v2.json'} | ${'w3citylights-axe-v3.3.2.sarif'}
        ${'basic-axe-v3.4.1.reporter-v1.json'}        | ${'basic-axe-v3.4.1.sarif'}
        ${'basic-axe-v3.4.1.reporter-v2.json'}        | ${'basic-axe-v3.4.1.sarif'}
        ${'w3citylights-axe-v3.4.1.reporter-v1.json'} | ${'w3citylights-axe-v3.4.1.sarif'}
        ${'w3citylights-axe-v3.4.1.reporter-v2.json'} | ${'w3citylights-axe-v3.4.1.sarif'}
    `(
        'converts pinned v1/v2 input $inputFile to pinned output $outputFile',
        ({ inputFile, outputFile }) => {
            const input: AxeResults = readTestResourceJSON(inputFile);
            const expectedOutput: SarifLog = readTestResourceJSON(outputFile);

            const actualOutput: SarifLog = convertAxeToSarif(input);

            expect(actualOutput).toEqual(expectedOutput);
        },
    );

    it.each`
        inputFile                                     | baselineFile
        ${'basic-axe-v3.4.1.reporter-v1.json'}        | ${'basic-axe-v3.4.1.sarif'}
        ${'w3citylights-axe-v3.4.1.reporter-v1.json'} | ${'w3citylights-axe-v3.4.1.sarif'}
    `(
        'produces files with "unchanged" baseline states for $inputFile when applying to its own results from $baselineFile',
        ({ inputFile, baselineFile }) => {
            const input: AxeResults = readTestResourceJSON(inputFile);

            const actualOutput: SarifLog = convertAxeToSarif(input, {
                baselineFile: testResourceFilePath(baselineFile),
            });

            for (const result of actualOutput.runs[0]!.results!) {
                expect(result).toHaveProperty('baselineState', 'unchanged');
            }
        },
    );

    it.each`
        inputFile                                     | baselineFile
        ${'basic-axe-v3.4.1.reporter-v1.json'}        | ${'empty-axe-v3.4.1.sarif'}
        ${'w3citylights-axe-v3.4.1.reporter-v1.json'} | ${'empty-axe-v3.4.1.sarif'}
    `(
        'produces files with "new" baseline states for $inputFile when applying empty results from $baselineFile',
        ({ inputFile, baselineFile }) => {
            const input: AxeResults = readTestResourceJSON(inputFile);

            const actualOutput: SarifLog = convertAxeToSarif(input, {
                baselineFile: testResourceFilePath(baselineFile),
            });

            for (const result of actualOutput.runs[0]!.results!) {
                expect(result).toHaveProperty('baselineState', 'new');
            }
        },
    );

    it('emits a reasonable exception when the SARIF Multitool outputs an error', () => {
        const input: AxeResults = readTestResourceJSON(
            'basic-axe-v3.4.1.reporter-v1.json',
        );

        expect(() =>
            convertAxeToSarif(input, {
                baselineFile: 'doesnt_exist.sarif',
            }),
        ).toThrowError(
            /SARIF Multitool failed with exit code 1\. Full output:\s+System\.IO\.FileNotFoundException/,
        );
    });
});

// This initializes global state that the reporter API assumes is available
require('axe-core');

describe('public sarifReporter API', () => {
    const emptyAxeRunOptions = {};

    // Normalized values are the pinned expectations from generated test-resources files
    function normalizeEnvironmentDerivedSarifProperties(sarif: SarifLog): void {
        sarif.runs[0]!.invocations!.forEach(i => {
            i.endTimeUtc = testResourceTimestampPlaceholder;
            i.startTimeUtc = testResourceTimestampPlaceholder;
        });
    }

    it('converts empty/minimal axe rawObject input with no results to the pinned minimal SARIF output', done => {
        const minimalAxeRawInput: AxeRawResult[] = [];

        function callback(convertedSarifResults: SarifLog) {
            normalizeEnvironmentDerivedSarifProperties(convertedSarifResults);

            expect(convertedSarifResults).toMatchSnapshot();
            done();
        }

        sarifReporter(minimalAxeRawInput, emptyAxeRunOptions, callback);
    });

    // Since the integration tests of the raw converter involve global page/axe state,
    // it isn't very meaningful to test cases that involve old axe versions here.
    it.each`
        inputFile                               | outputFile
        ${'basic-axe-v3.4.1.reporter-raw.json'} | ${'basic-axe-v3.4.1.sarif'}
    `(
        'converts pinned raw input $inputFile to pinned output $outputFile',
        async ({ inputFile, outputFile }) => {
            return new Promise(resolve => {
                const input: AxeRawResult[] = readTestResourceJSON(inputFile);
                const expectedOutput: SarifLog = readTestResourceJSON(
                    outputFile,
                );

                function callback(convertedSarifResults: SarifLog) {
                    normalizeEnvironmentDerivedSarifProperties(
                        convertedSarifResults,
                    );

                    expect(convertedSarifResults).toEqual(expectedOutput);
                    resolve();
                }

                sarifReporter(input, emptyAxeRunOptions, callback);
            });
        },
    );
});
