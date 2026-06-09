import {
  ScraperValidationError,
  UpstreamRequestError,
  UpstreamTimeoutError,
} from "./scraperService.js";
import {
  YoutubeMusicAuthError,
  YoutubeMusicRateLimitError,
} from "./youtubeMusicService.js";

const buildFailureBody = (publicMessage) => ({
  status: "FAILED",
  error: publicMessage,
});

const serializeError = (error) => {
  if (!(error instanceof Error)) {
    return { value: error };
  }

  return {
    name: error.name,
    message: error.message,
    code: error.code,
    status: error.status,
    upstreamStatus: error.upstreamStatus,
    details: error.details,
    stack: error.stack,
  };
};

const logFailure = ({
  handler,
  logLevel,
  status,
  publicMessage,
  logContext,
  error,
}) => {
  const logger = console[logLevel] || console.error;

  logger(`[${handler}] ${publicMessage}`, {
    status,
    publicMessage,
    ...logContext,
    error: serializeError(error),
  });
};

export const mapErrorToHttpResponse = (error, context = {}) => {
  const base = {
    handler: context.handler || "request",
    logContext: context.logContext || {},
  };

  if (error instanceof UpstreamTimeoutError || error?.name === "TimeoutError") {
    return {
      ...base,
      status: 504,
      publicMessage: "Upstream request timed out",
      logLevel: "error",
    };
  }

  if (error instanceof UpstreamRequestError) {
    return {
      ...base,
      status: 502,
      publicMessage: "Upstream request failed",
      logLevel: "error",
    };
  }

  if (error instanceof YoutubeMusicAuthError) {
    return {
      ...base,
      status: 401,
      publicMessage: "YouTube Music authentication failed",
      logLevel: "error",
    };
  }

  if (error instanceof YoutubeMusicRateLimitError) {
    return {
      ...base,
      status: 429,
      publicMessage: "YouTube Music rate limit reached",
      logLevel: "warn",
    };
  }

  if (error instanceof ScraperValidationError) {
    return {
      ...base,
      status: 500,
      publicMessage: "Internal server error",
      logLevel: "error",
    };
  }

  if (error?.message === "RSS_UNAVAILABLE") {
    return {
      ...base,
      status: 502,
      publicMessage: "RSS feed unavailable",
      logLevel: "error",
    };
  }

  return {
    ...base,
    status: 500,
    publicMessage: "Internal server error",
    logLevel: "error",
  };
};

export const sendFailure = (
  res,
  { status, publicMessage, handler, logLevel = status >= 500 ? "error" : "warn", logContext = {}, error },
) => {
  logFailure({
    handler: handler || "request",
    logLevel,
    status,
    publicMessage,
    logContext,
    error,
  });

  return res.status(status).json(buildFailureBody(publicMessage));
};

export const sendSanitizedError = (res, error, context = {}) => {
  const mapped = mapErrorToHttpResponse(error, context);

  return sendFailure(res, {
    ...mapped,
    error,
  });
};
