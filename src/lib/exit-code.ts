// Exit codes for the dev CLI
export enum ExitCode {
  Success = 0,
  Generic = 1,
  BadInput = 2,
  ExternalTool = 3,
  Config = 4,
  FileSystem = 5,
  Unexpected = 99,
}
