/** @jsx jsx */

import { jsx } from '@emotion/core'
import React from 'react'
import ReactDOM from 'react-dom'
import { assign, Machine } from 'xstate'
import { useMachine } from '@xstate/react'
import ApolloClient, { gql } from 'apollo-boost'

const client = new ApolloClient({
  uri: 'https://graphql.fauna.com/graphql',
  headers: {
    Authorization: `Bearer ${process.env.FAUNA_SECRET}`,
  },
})

const createSentiment = value => gql`
  mutation CreateSentiment {
    createSentiment(data: {
      value: ${value}
    }) {
      value
    }
  }
`

const getAllSentiments = gql`
  query GetAllSentiments {
    allSentiments {
      data {
        value
      }
    }
  }
`

const sentimentMachine = Machine(
  {
    id: 'sentiment',
    initial: 'idle',
    context: {
      level: null,
    },
    states: {
      idle: {
        on: {
          RESET: {
            actions: ['resetLevel'],
          },
          SELECT: {
            actions: ['updateLevel'],
          },
          SUBMIT: {
            target: 'submitting',
            cond: 'levelSelected',
          },
        },
      },
      submitting: {
        invoke: {
          id: 'submission',
          src: 'submission',
          onDone: 'success',
          onError: 'failure',
        },
      },
      success: {},
      failure: {
        on: {
          RESET: {
            target: 'idle',
            actions: ['resetLevel'],
          },
          RETRY: 'submitting',
        },
      },
    },
  },
  {
    actions: {
      resetLevel: assign({
        level: null,
      }),
      updateLevel: assign({
        level: (context, event) => event.level,
      }),
    },
    guards: {
      levelSelected: context => context.level !== null,
    },
    services: {
      submission: context =>
        client.mutate({
          mutation: createSentiment(context.level),
        }),
    },
  }
)

const Form = ({ current, send }) => {
  const { level } = current.context

  const handleSubmission = e => {
    e.preventDefault()
    send('SUBMIT')
  }

  return (
    <form onSubmit={handleSubmission}>
      <div>On a scale from 0 to 10, how are you feeling?</div>
      <div
        css={{
          marginTop: 30,
          marginBottom: 30,
        }}
      >
        {Array(11)
          .fill()
          .map((_, index) => {
            const selected = level === index

            return (
              <button
                css={{
                  appearance: 'none',
                  backgroundColor: selected ? '#09e' : '#f5f5f5',
                  color: selected ? '#fff' : null,
                  fontSize: '1rem',
                  padding: '0.5rem 1rem',
                  margin: '0.5rem',
                  border: `2px solid ${selected ? '#09e' : '#aaa'}`,
                  borderRadius: 5,
                  transition: 'all .2s ease',
                  cursor: 'pointer',

                  '&:hover': {
                    transform: 'translateY(-2px)',
                  },

                  '&:focus': {
                    backgroundColor: selected ? '#09e' : '#def',
                    border: '2px solid #09b',
                    outline: 'none',
                  },
                }}
                key={index}
                onClick={() => {
                  send({ type: 'SELECT', level: index })
                }}
                type="button"
              >
                {index}
              </button>
            )
          })}
      </div>

      <div>
        <button
          css={{
            appearance: 'none',
            backgroundColor: '#f5f5f5',
            fontSize: '1rem',
            padding: '1rem',
            marginRight: '1rem',
            borderRadius: 5,
          }}
          onClick={() => {
            send('RESET')
          }}
          type="button"
        >
          Reset
        </button>
        <button
          css={{
            appearance: 'none',
            backgroundColor: '#09e',
            color: '#fff',
            fontSize: '1rem',
            padding: '1rem',
            borderRadius: 5,
          }}
          onClick={handleSubmission}
          type="submit"
        >
          Submit
        </button>
      </div>
    </form>
  )
}

const Failure = ({ send }) => (
  <div>
    <div css={{ marginBottom: 30 }}>Sorry, the form failed to submit.</div>
    <div>
      <button
        css={{
          appearance: 'none',
          backgroundColor: '#f5f5f5',
          fontSize: '1rem',
          padding: '1rem',
          marginRight: '1rem',
          borderRadius: 5,
        }}
        onClick={() => {
          send('RETRY')
        }}
        type="button"
      >
        Retry
      </button>
      <button
        css={{
          appearance: 'none',
          backgroundColor: '#09e',
          color: '#fff',
          fontSize: '1rem',
          padding: '1rem',
          borderRadius: 5,
        }}
        onClick={() => {
          send('RESET')
        }}
        type="button"
      >
        Reset
      </button>
    </div>
  </div>
)

const calculateAverageSentiment = sentiments => {
  const totalSentiment = sentiments.reduce((acc, cur) => acc + cur.value, 0)
  return (totalSentiment / sentiments.length).toFixed(1)
}

const resultsMachine = Machine(
  {
    id: 'results',
    initial: 'idle',
    context: {
      sentiments: [],
    },
    states: {
      idle: {
        on: {
          REQUEST: 'loading',
        },
      },
      loading: {
        invoke: {
          id: 'getAllSentiments',
          src: 'getAllSentiments',
          onDone: {
            target: 'success',
            actions: ['updateSentiments'],
          },
          onError: 'failure',
        },
      },
      success: {},
      failure: {},
    },
  },
  {
    actions: {
      updateSentiments: assign({
        sentiments: (context, event) => event.data.data.allSentiments.data,
      }),
    },
    services: {
      getAllSentiments: () =>
        client.query({
          query: getAllSentiments,
        }),
    },
  }
)

const Results = () => {
  const [current, send] = useMachine(resultsMachine)
  const { sentiments } = current.context

  if (current.matches('loading')) {
    return <div>Tabulating results...</div>
  }

  if (current.matches('failure')) {
    return (
      <div>Sorry, there was an error calculating the results. Our bad.</div>
    )
  }

  if (current.matches('success')) {
    return (
      <div>
        <div>The average score is...</div>
        <div css={{ fontSize: '2rem', fontWeight: 'bold', margin: 15 }}>
          {calculateAverageSentiment(sentiments)}
        </div>
        <div>
          ...out of {sentiments.length} participants. Thanks for being one of
          them.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div css={{ marginBottom: 30 }}>Would you like to see the results?</div>
      <button
        css={{
          appearance: 'none',
          backgroundColor: '#09e',
          color: '#fff',
          fontSize: '1rem',
          padding: '1rem',
          borderRadius: 5,
        }}
        onClick={() => {
          send('REQUEST')
        }}
        type="button"
      >
        Yes
      </button>
    </div>
  )
}

const Success = () => (
  <div>
    <div css={{ marginBottom: 30 }}>Success! Thank you for participating.</div>
    <Results />
  </div>
)

const App = () => {
  const [current, send] = useMachine(sentimentMachine)

  const renderState = () => {
    switch (true) {
      case current.matches('idle'):
        return <Form current={current} send={send} />

      case current.matches('submitting'):
        return <div>Submitting data...</div>

      case current.matches('failure'):
        return <Failure send={send} />

      case current.matches('success'):
        return <Success />

      default:
        return null
    }
  }

  return (
    <div
      css={{
        fontFamily: 'sans-serif',
        textAlign: 'center',
      }}
    >
      <h1>Room Sentiment</h1>
      {renderState()}
    </div>
  )
}

ReactDOM.render(<App />, document.getElementById('app'))
