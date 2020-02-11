// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as Axe from 'axe-core';
import * as Sarif from 'sarif';
import { AxeRawResult } from './axe-raw-result';
import { defaultAxeRawSarifConverter } from './axe-raw-sarif-converter';
import { applyBaselineFile } from './baseline';
import { ConverterOptions } from './converter-options';
import { EnvironmentData } from './environment-data';
import { getEnvironmentDataFromEnvironment } from './environment-data-provider';
import { defaultSarifConverter } from './sarif-converter';

export { ConverterOptions } from './converter-options';
export type SarifLog = Sarif.Log;

export function convertAxeToSarif(
    axeResults: Axe.AxeResults,
    options?: ConverterOptions,
): SarifLog {
    options = options || {};
    const sarifConverter = defaultSarifConverter();
    let results = sarifConverter.convert(axeResults, options);
    if (options.baselineFile != null) {
        results = applyBaselineFile(results, options.baselineFile);
    }
    return results;
}

export function sarifReporter(
    rawResults: AxeRawResult[],
    runOptions: Axe.RunOptions,
    callback: (sarifResults: SarifLog) => void,
) {
    const converterOptions: ConverterOptions = {};
    const environmentData: EnvironmentData = getEnvironmentDataFromEnvironment();
    const sarifConverter = defaultAxeRawSarifConverter();
    const sarifOutput = sarifConverter.convert(
        rawResults,
        converterOptions,
        environmentData,
    );
    callback(sarifOutput);
}
