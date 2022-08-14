import { render, screen, waitFor} from '@testing-library/react';
import { rest } from 'msw';
import {setupServer} from 'msw/node';
import fetch from 'cross-fetch';
import React from 'react';
import { createTransat } from '..';
import '@testing-library/jest-dom/extend-expect'

const server = setupServer();
// Enable API mocking before tests.
beforeAll(() => server.listen());

// Reset any runtime request handlers we may add during the tests.
afterEach(() => server.resetHandlers());

// Disable API mocking after the tests are done.
afterAll(() => server.close());

const {useTransat, TransatProvider} = createTransat<{'hello': string}>();

function testApp(args: {
    server?: () => void,
    provider?: React.FC,
    component?: React.FC,
    } = {}
) {
    const serverCall = args.server ?? (() => {
        server.use(
            rest.get(`https://mywebsite.com/getState`, (req, res, ctx) => {
                console.log('server called');
                return res(ctx.json({
                    hello: 'world'
                }));
            })
        );
    });

    serverCall();

    const TestComponent = args.component ?? (() => {
        const {state} = useTransat();
        return (
            <div>
                <p>Hello {state?.hello}</p>
            </div>
        )
    });

    const TestApplication = args.provider ?? (() => {
        return (
            <TransatProvider
                fetchState={() => fetch('https://mywebsite.com/getState').then(res => res.json())}
            >
                <TestComponent/>
            </TransatProvider>
        )
    })

    render(<TestApplication />);

}


describe('Transat E2E Tests', () => {
    it('fetches the initial state', async ()=> {
        testApp();
        await waitFor(() => {
            expect(screen.getByText('Hello world')).toBeInTheDocument();
        });

    });

    it('allows to do an optimistic UI change', async () => {
        testApp({
            component: () => {
                const {state, setState} = useTransat();
                return (
                    <div>
                        <p>Hello {state?.hello}</p>
                        <button onClick={() => setState({...state, hello: 'sailor'})}>
                            Change
                        </button>
                    </div>
                )
            }
        });

        await waitFor(async () => {
            expect(screen.getByText('Hello world')).toBeInTheDocument();
            //click on the button
            await screen.getByText('Change').click();
            expect(screen.getByText('Hello sailor')).toBeInTheDocument();
        });
    });
});