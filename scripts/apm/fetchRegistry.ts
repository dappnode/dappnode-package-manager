import {ethers} from "ethers";
import {abi} from "./registryABI";

// Topic name
const eventNewRepo = "NewRepo";
const maxBlocksPerRequest = 100_000;
const minBlocksPerRequest = 5;
/** Failures are very slow, decrease size fast to get to a good range fast */
const blockStepDecrease = 4;
/** Successes are fast, don't increase too quickly to not trigger failures again too soon */
const blockStepIncrease = 2;

export interface RegistryNewRepoEvent {
  name: string;
  repo: string;
  txHash: string;
  deployTimestampSec: number;
  fullEnsName: string;
}

export async function getRegistryOnRange(
  provider: ethers.providers.Provider,
  registryEns: string,
  _fromBlock: number,
  _toBlock: number
): Promise<RegistryNewRepoEvent[]> {
  // TODO: Ensure registryEns is not an address, but an ENS domain
  const registryAddress = await provider.resolveName(registryEns);
  if (!registryAddress) {
    throw Error(`Registry ENS ${registryEns} does not exist`);
  }

  const registryInterface = new ethers.utils.Interface(abi);
  const eventNewRepoTopic = registryInterface.getEventTopic(eventNewRepo);

  const events: RegistryNewRepoEvent[] = [];

  // Fetch events in a dynamic step depending on errors
  // Geth nodes may randomly take much longer to process logs on some sections of the chain
  let latestBlock = _fromBlock;
  let blockStep = maxBlocksPerRequest;

  while (latestBlock < _toBlock) {
    const from = latestBlock;
    const to = Math.min(latestBlock + blockStep, _toBlock);

    const logsResult = await wrapError(
      provider
        .getLogs({
          address: registryAddress,
          fromBlock: from,
          toBlock: to,
          topics: [eventNewRepoTopic],
        })
        .catch((e) => {
          e.message = `Error retrieving logs from ${registryEns} [${from},${to}]: ${e.message}`;
          throw e;
        })
    );

    if (logsResult.err) {
      // On failure, decrease step
      if (blockStep <= minBlocksPerRequest) {
        throw logsResult.err;
      } else {
        blockStep = Math.max(Math.floor(blockStep / blockStepDecrease), minBlocksPerRequest);
        continue;
      }
    } else {
      // On success, increase step
      blockStep = Math.min(blockStep * blockStepIncrease, maxBlocksPerRequest);
      latestBlock = to;
    }

    console.log(`Fetched ${registryEns} ${eventNewRepo} events`, logsResult.result.length);

    const rangeEvents = await Promise.all(
      logsResult.result.map(async (log) => {
        const event = registryInterface.parseLog(log);
        if (!log.blockNumber) {
          throw Error(`${eventNewRepo} log has no blockNumber`);
        }
        if (!log.transactionHash) {
          throw Error(`${eventNewRepo} log at ${log.blockNumber} has no txHash`);
        }
        if (!event.args) {
          throw Error(`${eventNewRepo} event at ${log.blockNumber} has no args`);
        }
        const name = event.args.name as string;
        const repo = event.args.repo as string;
        const block = await provider.getBlock(log.blockNumber);
        return {
          name,
          repo,
          fullEnsName: `${name}.${registryEns}`,
          deployTimestampSec: block.timestamp,
          txHash: log.transactionHash,
        };
      })
    );

    for (const event of rangeEvents) {
      events.push(event);
    }
  }

  return events;
}

type Result<T> = {err: null; result: T} | {err: Error};

/**
 * Wraps a promise to return either an error or result
 * Useful for SyncChain code that must ensure in a sample code
 * ```ts
 * try {
 *   A()
 * } catch (e) {
 *   B()
 * }
 * ```
 * only EITHER fn A() and fn B() are called, but never both. In the snipped above
 * if A() throws, B() would be called.
 */
export async function wrapError<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    return {err: null, result: await promise};
  } catch (err) {
    return {err: err as Error};
  }
}
