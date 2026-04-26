/** Request sent to create a user. */
export interface CreateUserRequest<TMeta> {
  readonly email: string;
  metadata?: TMeta;
  validate(): boolean;
}

/** API response wrapper. */
export type ApiResponse<T> = {
  data: T;
  error?: string;
};

export class UserController implements CreateUserRequest<Record<string, string>> {
  readonly email: string = "";
  validate(): boolean {
    return true;
  }
}

export function createUser(input: CreateUserRequest<Record<string, string>>): ApiResponse<string> {
  return { data: input.email };
}
