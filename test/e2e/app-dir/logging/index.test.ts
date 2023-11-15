import stripAnsi from 'strip-ansi'
import { check } from 'next-test-utils'
import { createNextDescribe } from 'e2e-utils'

function parseLogsFromCli(cliOutput: string) {
  const logs = stripAnsi(cliOutput)
    .split('\n')
    .filter((log) => log.includes('Cache missed reason') || log.includes('GET'))

  return logs.reduce((parsedLogs, log) => {
    if (log.includes('Cache missed reason')) {
      // cache miss reason
      const reasonSegment = log.split('Cache missed reason: ', 2)[1].trim()
      const reason = reasonSegment.slice(1, -1)
      parsedLogs[parsedLogs.length - 1].cache = reason
    } else {
      // request info
      const trimmedLog = log.replace(/^[^a-zA-Z]+/, '')
      const parts = trimmedLog.split(' ', 5)
      const method = parts[0]
      const url = parts[1]
      const statusCode = parseInt(parts[2])
      const responseTime = parseInt(parts[4])

      const parsedLog = {
        method,
        url,
        statusCode,
        responseTime,
        cache: undefined,
      }
      parsedLogs.push(parsedLog)
    }
    return parsedLogs
  }, [] as any[])
}

createNextDescribe(
  'app-dir - logging',
  {
    skipDeployment: true,
    files: __dirname,
  },
  ({ next, isNextDev }) => {
    function runTests({ withFetchesLogging }: { withFetchesLogging: boolean }) {
      if (withFetchesLogging) {
        it('should only log requests in dev mode', async () => {
          const outputIndex = next.cliOutput.length
          await next.fetch('/default-cache')

          await check(() => {
            const logs = stripAnsi(next.cliOutput.slice(outputIndex))
            const hasLogs = logs.includes('GET /default-cache 200')

            if (isNextDev && hasLogs) {
              return 'success'
            }

            if (!isNextDev && !hasLogs) {
              return 'success'
            }
          }, 'success')
        })

        if (isNextDev) {
          it("should log 'skip' cache status with a reason when cache: 'no-cache' is used", async () => {
            const outputIndex = next.cliOutput.length
            await next.fetch('/default-cache')

            await check(() => {
              const logs = parseLogsFromCli(next.cliOutput.slice(outputIndex))

              const logEntry = logs.find((log) =>
                log.url.includes('api/random?no-cache')
              )

              // expend full url
              expect(logs.every((log) => log.url.includes('..'))).toBe(false)

              if (logEntry?.cache === 'cache: no-cache') {
                return 'success'
              }
            }, 'success')
          })

          it("should log 'skip' cache status with a reason when revalidate: 0 is used", async () => {
            const outputIndex = next.cliOutput.length
            await next.fetch('/default-cache')
            await check(() => {
              const logs = parseLogsFromCli(next.cliOutput.slice(outputIndex))

              const logEntry = logs.find((log) =>
                log.url.includes('api/random?revalidate-0')
              )

              if (logEntry?.cache === 'revalidate: 0') {
                return 'success'
              }
            }, 'success')
          })

          it("should log 'skip' cache status with a reason when the browser indicates caching should be ignored", async () => {
            const outputIndex = next.cliOutput.length
            await next.fetch('/default-cache', {
              headers: { 'Cache-Control': 'no-cache' },
            })
            await check(() => {
              const logs = parseLogsFromCli(next.cliOutput.slice(outputIndex))

              const logEntry = logs.find((log) =>
                log.url.includes('api/random?auto-cache')
              )

              if (
                logEntry?.cache === 'cache-control: no-cache (hard refresh)'
              ) {
                return 'success'
              }
            }, 'success')
          })
        }
      } else {
        it('should not log fetch requests at all', async () => {
          const outputIndex = next.cliOutput.length
          await next.fetch('/default-cache')

          await check(() => {
            const logs = stripAnsi(next.cliOutput.slice(outputIndex))
            if (logs.includes('GET /default-cache 200')) {
              return 'fail'
            }

            return 'success'
          }, 'success')
        })
      }

      if (isNextDev) {
        it('should not contain trailing word page for app router routes', async () => {
          const logLength = next.cliOutput.length
          await next.fetch('/')

          await check(() => {
            const output = stripAnsi(next.cliOutput.slice(logLength))
            expect(output).toContain('/')
            expect(output).not.toContain('/page')

            return 'success'
          }, /success/)
        })

        it('should not contain metadata internal segments for dynamic metadata routes', async () => {
          const logLength = next.cliOutput.length
          await next.fetch('/dynamic/big/icon')

          await check(() => {
            const output = stripAnsi(next.cliOutput.slice(logLength))
            expect(output).toContain('/dynamic/[slug]/icon')
            expect(output).not.toContain('/(group)')
            expect(output).not.toContain('[[...__metadata_id__]]')
            expect(output).not.toContain('/route')

            return 'success'
          }, /success/)
        })
      }

      describe('cache + revalidate warning', () => {
        beforeAll(async () => {
          await next.fetch('/default-cache')
        })
        it('should log when request input is a string', async () => {
          await check(() => {
            return next.cliOutput.includes(
              'fetch for https://next-data-api-endpoint.vercel.app/api/random?revalidate-3-force-cache on /default-cache specified "cache: force-cache" and "revalidate: 3", only one should be specified'
            )
              ? 'success'
              : 'fail'
          }, 'success')
        })

        it('should log when request input is a Request instance', async () => {
          await check(() => {
            return next.cliOutput.includes(
              'fetch for https://next-data-api-endpoint.vercel.app/api/random?request-input-cache-override on /default-cache specified "cache: force-cache" and "revalidate: 3", only one should be specified.'
            )
              ? 'success'
              : 'fail'
          }, 'success')
        })

        it('should not log when overriding cache within the Request object', async () => {
          await check(() => {
            return next.cliOutput.includes(
              `fetch for https://next-data-api-endpoint.vercel.app/api/random?request-input on /default-cache specified "cache: default" and "revalidate: 3", only one should be specified.`
            )
              ? 'fail'
              : 'success'
          }, 'success')
        })
      })
    }

    describe('with verbose logging', () => {
      runTests({ withFetchesLogging: true })
    })

    describe('with verbose logging for edge runtime', () => {
      beforeAll(async () => {
        await next.stop()
        const layoutContent = await next.readFile('app/layout.js')
        await next.patchFile(
          'app/layout.js',
          layoutContent + `\nexport const runtime = 'edge'`
        )
        await next.start()
      })

      runTests({ withFetchesLogging: false })
    })

    describe('with default logging', () => {
      beforeAll(async () => {
        await next.stop()
        await next.deleteFile('next.config.js')
        await next.start()
      })

      runTests({ withFetchesLogging: false })
    })
  }
)
