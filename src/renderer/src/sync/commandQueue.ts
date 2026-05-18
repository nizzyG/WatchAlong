import type { SyncCommand } from '@shared/types'

export class SyncCommandQueue {
  private queue: SyncCommand[] = []

  push(command: SyncCommand): void {
    this.queue = supersedeCommands(this.queue, command)
  }

  shift(): SyncCommand | undefined {
    return this.queue.shift()
  }

  snapshot(): SyncCommand[] {
    return [...this.queue]
  }

  get length(): number {
    return this.queue.length
  }
}

export function supersedeCommands(queue: SyncCommand[], command: SyncCommand): SyncCommand[] {
  if (isSeekLike(command)) {
    return [...queue.filter((item) => !isSeekLike(item)), command]
  }

  if (command.type === 'play') {
    return [...queue.filter((item) => item.type !== 'play' && item.type !== 'pause'), command]
  }

  if (command.type === 'pause') {
    return [...queue.filter((item) => item.type !== 'play' && item.type !== 'pause'), command]
  }

  return [...queue, command]
}

function isSeekLike(command: SyncCommand): boolean {
  return command.type === 'seekReaction' || command.type === 'seekMovie' || command.type === 'loadSession'
}
