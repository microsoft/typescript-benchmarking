// Rational approximations for erf/erfc, split by input range to preserve precision in the tails.
const ERF_NUMERATOR = [
    9.604973739870516e0,
    9.002601972038427e1,
    2.232005345946843e3,
    7.003325141128051e3,
    5.55923013010395e4,
];

const ERF_DENOMINATOR = [
    3.356171416475031e1,
    5.213579497801527e2,
    4.594323829709801e3,
    2.26290000613891e4,
    4.92673942608636e4,
];

const ERFC_NUMERATOR = [
    2.461969814735305e-10,
    5.641895648310689e-1,
    7.463210564422699e0,
    4.863719709856814e1,
    1.965208329560771e2,
    5.264451949954774e2,
    9.345285271719576e2,
    1.027551886895157e3,
    5.575353353693993e2,
];

const ERFC_DENOMINATOR = [
    1.32281951154745e1,
    86.707214088599,
    354.93777888782,
    9.757085017432055e2,
    1.823909166879098e3,
    2.24633760818711e3,
    1.656663091941613e3,
    5.575353408177277e2,
];

const ERFC_LARGE_NUMERATOR = [
    5.641895835477551e-1,
    1.275366707599781e0,
    5.019050422511805e0,
    6.160210979930536e0,
    7.409742699504489e0,
    2.978866653721002e0,
];

const ERFC_LARGE_DENOMINATOR = [
    2.260528632201173e0,
    9.39603524938001,
    12.0489539808097,
    1.708144507475659e1,
    9.608968090632859e0,
    3.369076451000815e0,
];

export function standardNormalCdf(x: number): number {
    return complementaryErrorFunction(-x / Math.SQRT2) / 2;
}

function errorFunction(x: number): number {
    if (Math.abs(x) > 1) {
        return 1 - complementaryErrorFunction(x);
    }

    const xSquared = x * x;
    return x * evaluatePolynomial(xSquared, ERF_NUMERATOR)
        / evaluatePolynomialWithImplicitLeadingOne(xSquared, ERF_DENOMINATOR);
}

function complementaryErrorFunction(x: number): number {
    const absoluteX = Math.abs(x);
    if (absoluteX < 1) {
        return 1 - errorFunction(x);
    }

    const exponent = -absoluteX * absoluteX;
    if (exponent < -745) {
        return x < 0 ? 2 : 0;
    }

    const numerator = absoluteX < 8 ? ERFC_NUMERATOR : ERFC_LARGE_NUMERATOR;
    const denominator = absoluteX < 8 ? ERFC_DENOMINATOR : ERFC_LARGE_DENOMINATOR;
    const result = Math.exp(exponent) * evaluatePolynomial(absoluteX, numerator)
        / evaluatePolynomialWithImplicitLeadingOne(absoluteX, denominator);
    return x < 0 ? 2 - result : result;
}

function evaluatePolynomial(x: number, coefficients: readonly number[]): number {
    let result = coefficients[0];
    for (let i = 1; i < coefficients.length; i++) {
        result = result * x + coefficients[i];
    }
    return result;
}

function evaluatePolynomialWithImplicitLeadingOne(x: number, coefficients: readonly number[]): number {
    let result = x + coefficients[0];
    for (let i = 1; i < coefficients.length; i++) {
        result = result * x + coefficients[i];
    }
    return result;
}
