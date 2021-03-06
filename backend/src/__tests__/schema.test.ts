import { graphql } from 'graphql'
import jwt from 'jsonwebtoken'
import fetchGitHubToken from '../lib/fetchGitHubToken'
import fetchGitHubUser from '../lib/fetchGitHubUser'
import schema from '../schema'

jest.mock('../lib/fetchGitHubToken')
jest.mock('../lib/fetchGitHubUser')

// Save the previous environment to restore later.
const previousEnv = process.env

beforeEach(() => {
  // Make a copy of the previous environment.
  process.env = { ...previousEnv }
})

afterEach(() => {
  // Restore the previous environment.
  process.env = previousEnv
})

describe('isSignedIn', () => {
  test('returns true if token is valid', async () => {
    process.env.APP_SECRET = 'fake_app_secret'

    const token = jwt.sign({}, process.env.APP_SECRET)
    const document = `query { isSignedIn }`
    const context = { request: { cookies: { token } } }
    const result = await graphql(schema, document, null, context, {})

    expect(result.data).toEqual({ isSignedIn: true })
  })

  test('returns false if token is invalid', async () => {
    const token = 'bad_token'
    const document = `query { isSignedIn }`
    const context = { request: { cookies: { token } } }
    const result = await graphql(schema, document, null, context, {})

    expect(result.data).toEqual({ isSignedIn: false })
  })

  test('returns false if token is undefined', async () => {
    const document = `query { isSignedIn }`
    const context = { request: { cookies: {} } }
    const result = await graphql(schema, document, null, context, {})

    expect(result.data).toEqual({ isSignedIn: false })
  })
})

describe('signedInUser', () => {
  test('returns signed-in user', async () => {
    process.env.APP_SECRET = 'fake_app_secret'

    const user = { id: 'fake_user_id' }
    const getUser = jest.fn().mockReturnValue(user)
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET)
    const document = `query { signedInUser { id } }`
    const context = {
      request: { cookies: { token } },
      prisma: { user: getUser },
    }
    const result = await graphql(schema, document, null, context, {})

    expect(getUser).toHaveBeenCalledWith({ id: user.id })
    expect(result.data).toEqual({ signedInUser: { id: user.id } })
  })

  test('returns an error if token is invalid', async () => {
    const token = 'bad_token'
    const document = `query { signedInUser { id } }`
    const context = { request: { cookies: { token } } }
    const result = await graphql(schema, document, null, context, {})

    expect(result.data).toBeFalsy()
    expect(result.errors).toBeTruthy()
  })

  test('returns an error if token is undefined', async () => {
    const document = `query { signedInUser { id } }`
    const context = { request: { cookies: {} } }
    const result = await graphql(schema, document, null, context, {})

    expect(result.data).toBeFalsy()
    expect(result.errors).toBeTruthy()
  })
})

describe('signIn', () => {
  // Cast mock functions to the correct types.
  const fetchGitHubTokenMock = fetchGitHubToken as jest.Mock<
    ReturnType<typeof fetchGitHubToken>
  >
  const fetchGitHubUserMock = fetchGitHubUser as jest.Mock<
    ReturnType<typeof fetchGitHubUser>
  >

  test('generates a JWT containing userId and gitHubToken', async () => {
    process.env.APP_SECRET = 'fake_app_secret'

    const gitHubCode = 'fake_github_code'
    const gitHubToken = 'fake_github_token'
    const gitHubUser = { id: 'fake_github_id' }
    const user = { id: 'fake_user_id' }

    // Define mock function return values.
    fetchGitHubTokenMock.mockReturnValueOnce(Promise.resolve(gitHubToken))
    fetchGitHubUserMock.mockReturnValueOnce(Promise.resolve(gitHubUser))

    // Set up and run mutation.
    const document = `
      mutation signIn($gitHubCode: String!) {
        signIn(gitHubCode: $gitHubCode) {
          token
        }
      }
    `
    const variables = { gitHubCode }
    const context = { prisma: { upsertUser: () => user } }
    const result = await graphql(schema, document, null, context, variables)

    // Assertions
    expect(result.data).toBeTruthy()
    expect(result.errors).toBeFalsy()

    if (result.data) {
      const payload = jwt.verify(
        result.data.signIn.token,
        process.env.APP_SECRET,
      ) as any
      expect(payload.userId).toEqual(user.id)
      expect(payload.gitHubToken).toEqual(gitHubToken)
    }
  })

  test('returns an error if unable to fetch gitHubToken', async () => {
    process.env.APP_SECRET = 'fake_app_secret'

    const gitHubCode = 'fake_github_code'
    const user = { id: 'fake_user_id' }

    // Define mock function return values.
    fetchGitHubTokenMock.mockReturnValueOnce(Promise.reject())

    // Set up and run mutation.
    const document = `
      mutation signIn($gitHubCode: String!) {
        signIn(gitHubCode: $gitHubCode) {
          token
        }
      }
    `
    const variables = { gitHubCode }
    const context = { prisma: { upsertUser: () => user } }
    const result = await graphql(schema, document, null, context, variables)

    // Assertions
    expect(result.data).toBeFalsy()
    expect(result.errors).toBeTruthy()
  })
})

describe('signOut', () => {
  test('clears token from response', async () => {
    const clearCookie = jest.fn()
    const document = `mutation { signOut }`
    const context = { response: { clearCookie } }
    const result = await graphql(schema, document, null, context, {})

    expect(clearCookie).toHaveBeenCalledWith('token')
    expect(result.data).toEqual({ signOut: true })
  })
})
