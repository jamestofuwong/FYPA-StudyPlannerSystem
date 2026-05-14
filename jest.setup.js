import '@testing-library/jest-dom'

/**
 * FIX: Request is not defined
 * Next.js bundles its own version of these objects. 
 * we use the "require" with the direct path to Next's internal tools 
 * so we don't need to install 'undici' or other libraries.
 */
try {
  const { Request, Response, Headers } = require('next/dist/compiled/undici');
  
  if (!global.Request) global.Request = Request;
  if (!global.Response) global.Response = Response;
  if (!global.Headers) global.Headers = Headers;
} catch (e) {
  // Fallback for older versions of Next.js
  global.Request = global.Request || class {};
  global.Response = global.Response || class {};
  global.Headers = global.Headers || class {};
}

const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({}),
    ok: true,
  })
);