import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function createHost(requestId?: string) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({
        header: (name: string) =>
          name === 'x-request-id' ? requestId : undefined,
      }),
    }),
  } as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('formats a not-found exception with the caller request id', () => {
    const { host, status, json } = createHost('req_test');

    filter.catch(new HttpException('Cannot GET /missing', 404), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Cannot GET /missing',
      details: [],
      requestId: 'req_test',
    });
  });

  it('turns validation messages into VALIDATION_ERROR details', () => {
    const { host, json } = createHost('req_validation');
    const exception = new HttpException(
      {
        message: ['email must be an email'],
        error: 'Bad Request',
        statusCode: 400,
      },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed.',
      details: ['email must be an email'],
      requestId: 'req_validation',
    });
  });

  it('keeps an explicit application error code', () => {
    const { host, json } = createHost('req_code');
    const exception = new HttpException(
      {
        code: 'MARKET_REQUIRED',
        message: 'Choose a market before ranking products.',
        details: [],
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );

    filter.catch(exception, host);

    expect(json).toHaveBeenCalledWith({
      statusCode: 422,
      code: 'MARKET_REQUIRED',
      message: 'Choose a market before ranking products.',
      details: [],
      requestId: 'req_code',
    });
  });

  it('hides unexpected errors behind a generic message', () => {
    const { host, status, json } = createHost();

    filter.catch(new Error('database password leaked'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0] as { message: string; requestId: string };
    expect(body.message).toBe('An unexpected error occurred.');
    expect(body.message).not.toContain('password');
    expect(body.requestId).toEqual(expect.any(String));
  });
});
