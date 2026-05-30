/**
 * Numeric primitives — a faithful 1:1 port of mobile/lib/core/utils/math_utils.dart.
 * Used for both the pixel→wavelength fit and the Beer-Lambert fit, plus
 * smoothing and peak detection during calibration.
 */
import type { LinearRegressionResult } from "./types";

/** Ordinary-least-squares linear regression on paired x/y data (+ R²). */
export function linearRegression(x: number[], y: number[]): LinearRegressionResult {
  if (x.length !== y.length) {
    throw new Error("x and y must have the same length.");
  }
  const n = x.length;
  if (n < 2) {
    throw new Error("At least two data points are required.");
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const meanX = sumX / n;
  const meanY = sumY / n;

  const sxx = sumX2 - n * meanX * meanX;
  const sxy = sumXY - n * meanX * meanY;
  const syy = sumY2 - n * meanY * meanY;

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  // Coefficient of determination (R²).
  const rSquaredRaw = syy === 0 ? 1.0 : (sxy * sxy) / (sxx * syy);
  const rSquared = Math.min(1, Math.max(0, rSquaredRaw));

  return { slope, intercept, rSquared };
}

/**
 * Centred moving average. The window is forced odd; edge values are averaged
 * over the available neighbours.
 */
export function movingAverage(values: number[], windowSize: number): number[] {
  if (values.length === 0) return [];
  if (windowSize <= 1) return [...values];

  let win = windowSize;
  if (win % 2 === 0) win += 1;
  const half = Math.floor(win / 2);

  const result = new Array<number>(values.length).fill(0);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = start; j <= end; j++) sum += values[j];
    result[i] = sum / (end - start + 1);
  }
  return result;
}

/**
 * Indices of local maxima (strictly greater than both immediate neighbours).
 * When minProminence > 0, only peaks whose prominence (drop to the higher of
 * the two surrounding valleys) meets the threshold are returned.
 */
export function findLocalMaxima(values: number[], minProminence = 0): number[] {
  if (values.length < 3) return [];

  const peaks: number[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] > values[i + 1]) {
      if (minProminence <= 0) {
        peaks.push(i);
      } else {
        // Walk left to the valley.
        let leftMin = values[i];
        for (let j = i - 1; j >= 0; j--) {
          if (values[j] > values[i]) break;
          if (values[j] < leftMin) leftMin = values[j];
        }
        // Walk right to the valley.
        let rightMin = values[i];
        for (let j = i + 1; j < values.length; j++) {
          if (values[j] > values[i]) break;
          if (values[j] < rightMin) rightMin = values[j];
        }
        const prominence = values[i] - Math.max(leftMin, rightMin);
        if (prominence >= minProminence) peaks.push(i);
      }
    }
  }
  return peaks;
}
