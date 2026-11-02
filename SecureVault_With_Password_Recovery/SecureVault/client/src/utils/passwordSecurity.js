export const sampleWordlist = [
  'password', '123456', '12345678', 'qwerty', 'letmein', 'welcome', 'admin',
  'password1', 'abc123', 'iloveyou', 'football', 'monkey',
];

export function evaluatePassword(password) {
  const checks = {
    length8: password.length >= 8,
    mixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
    digit: /\d/.test(password),
    length12: password.length >= 12,
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  const meetsPolicy = checks.length8 && checks.mixedCase && checks.digit;
  if (meetsPolicy && checks.length12 && checks.symbol) {
    return { strength: 'Strong', checks, reason: 'Meets the account policy and adds length and symbols, substantially increasing the search space.' };
  }
  if (meetsPolicy) {
    return { strength: 'Medium', checks, reason: 'Meets the registration policy, but more length or symbols would make guessing harder.' };
  }
  return { strength: 'Weak', checks, reason: 'Does not meet every SecureVault registration requirement and may also be easy to guess.' };
}

export function dictionarySimulation(password, wordlist = sampleWordlist) {
  const started = performance.now();
  let attempts = 0;
  let found = false;
  for (const candidate of wordlist) {
    attempts += 1;
    if (candidate === password) {
      found = true;
      break;
    }
  }
  return { found, attempts, elapsedMs: Number((performance.now() - started).toFixed(3)) };
}

const characterSets = {
  digits: '0123456789',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  mixed: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
};

export function bruteForceSimulation(password, characterSetName = 'digits') {
  const alphabet = characterSets[characterSetName] || characterSets.digits;
  const maxLength = 3;
  const attemptLimit = 5000;
  const timeLimitMs = 1500;
  const started = performance.now();
  let attempts = 0;
  let found = false;
  let reachedLimit = false;

  const search = (prefix, length) => {
    for (let i = 0; i < alphabet.length; i += 1) {
      if (attempts >= attemptLimit || performance.now() - started >= timeLimitMs) return false;
      attempts += 1;
      const candidate = prefix + alphabet[i];
      if (candidate === password) {
        found = true;
        return true;
      }
      if (length > 1 && search(candidate, length - 1)) return true;
    }
    return false;
  };

  for (let length = 1; length <= maxLength && !found; length += 1) {
    if (search('', length)) break;
  }
  reachedLimit = !found && (attempts >= attemptLimit || performance.now() - started >= timeLimitMs || attempts > 0);
  return { found, attempts, elapsedMs: Number((performance.now() - started).toFixed(3)), reachedLimit, alphabetSize: alphabet.length, maxLength };
}
