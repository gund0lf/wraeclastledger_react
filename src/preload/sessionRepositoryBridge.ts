import {
  SESSION_REPOSITORY_CHANNEL,
  SessionRepositoryRequestError,
  assertSessionRepositoryResponse,
  parseSessionRepositoryRequest,
  type SessionRepositoryRequest,
  type SessionRepositoryResponse,
} from '../shared/sessionRepositoryIpc';

export type SessionRepositoryInvoke = (
  channel: string,
  request: SessionRepositoryRequest,
) => Promise<unknown>;

export type SessionRepositoryBridge = (
  request: SessionRepositoryRequest,
) => Promise<SessionRepositoryResponse>;

/**
 * Construct the narrow preload bridge exposed as window.api.sessionRepository.
 * Both directions are validated because IPC data is an untrusted boundary even
 * when TypeScript says the renderer and main process agree.
 */
export function createSessionRepositoryBridge(
  invoke: SessionRepositoryInvoke,
): SessionRepositoryBridge {
  return async (input) => {
    const request = parseSessionRepositoryRequest(input);
    const response = await invoke(SESSION_REPOSITORY_CHANNEL, request);
    assertSessionRepositoryResponse(response);
    if (response.operation !== request.operation) {
      throw new SessionRepositoryRequestError(
        `response operation ${response.operation ?? 'null'} does not match ${request.operation}`,
      );
    }
    return response;
  };
}
