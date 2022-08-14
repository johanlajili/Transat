import { act, render, screen, waitFor} from '@testing-library/react';
import { rest } from 'msw';
import {setupServer} from 'msw/node';
import fetch from 'cross-fetch';
import React from 'react';
import { calculateVerificationToken, createTransat } from '..';
import '@testing-library/jest-dom/extend-expect'

const server = setupServer();
// Enable API mocking before tests.
beforeAll(() => server.listen());

// Reset any runtime request handlers we may add during the tests.
afterEach(() => server.resetHandlers());

// Disable API mocking after the tests are done.
afterAll(() => server.close());

const {useTransat, TransatProvider} = createTransat<{'hello': string, 'version': number}>();

function testApp(args: {
    server?: () => void,
    provider?: React.FC,
    component?: React.FC,
    } = {}
) {
    const serverCall = args.server ?? (() => {
        server.use(
            rest.get(`https://mywebsite.com/getState`, (req, res, ctx) => {
                return res(ctx.json({
                    hello: 'world',
                    version: 1
                }));
            })
        );
    });
    server.resetHandlers();
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
                        <button onClick={() => state && setState({...state, hello: 'sailor'})}>
                            Change
                        </button>
                    </div>
                )
            }
        });

        await waitFor(async () => {
            expect(screen.getByText('Hello world')).toBeInTheDocument();
            await screen.getByText('Change').click();
            expect(screen.getByText('Hello sailor')).toBeInTheDocument();
        });
    });

    it('allows to do an optimistic UI change and rollback', async () => {
        jest.useFakeTimers();
        testApp({
            component: () => {
                const {state, setState} = useTransat();
                return (
                    <div>
                        <p>Hello {state?.hello}</p>
                        <button onClick={() => {
                            const transaction = state && setState({...state, hello: 'sailor'});
                            
                            setTimeout(() => {
                                transaction?.cancel();
                            },4000);
                        }
                        }>
                            Change
                        </button>
                    </div>
                )
            }
        });

        await waitFor(async () => {
            expect(screen.getByText('Hello world')).toBeInTheDocument();
        });

        screen.getByText('Change').click();
        
        await waitFor(async () => {
            expect(screen.getByText('Hello sailor')).toBeInTheDocument();
        });
        
        jest.runAllTimers();

        await waitFor(async () => {
            expect(screen.getByText('Hello world')).toBeInTheDocument();
        });
        jest.useRealTimers();
        
    });

    it('allows to verify the changes against the backend token', async () => {

        testApp({
            server: () => {
                server.use(
                    rest.get(`https://mywebsite.com/getState`, (req, res, ctx) => {
                        return res(ctx.json({
                            hello: 'world',
                            version: 1
                        }));
                    }),
                    rest.get('https://mywebsite.com/setState', (req, res, ctx) => {
                        const value = req.url.searchParams.get('value');
                        
                        const state = {
                            hello: value,
                            version: 2
                        };

                        const token = calculateVerificationToken(state);
                        
                        return res(ctx.json(token));
                    })
                );
            },
            component: () => {
                const {state, setState} = useTransat();
                const [validated, setValidated] = React.useState(false);
                return (
                    <div>
                        {validated && <p>This has been validated</p>}
                        <p>Hello {state?.hello}</p>
                        <button onClick={() => {
                            const transaction = state && setState({...state, hello: 'sailor', version: state.version + 1});

                            fetch('https://mywebsite.com/setState?value=sailor').then(res => res.json()).then(token => {    
                            const validated = transaction?.validate(token).success;    
                                setValidated( validated ?? false);
                            })
                        }}>
                            Change
                        </button>
                    </div>
                )
            }
        });

        await waitFor(async () => {
            expect(screen.getByText('Hello world')).toBeInTheDocument();
        });

        act(() => {
            screen.getByText('Change').click();
        })
        

        await waitFor(async () => {
            expect(screen.queryByText('This has been validated')).toBeInTheDocument();
        });
    })
});