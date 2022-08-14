# Transat

Warning: this is a work in progress

# Intro

Transat is a full stack transactional state management library for react / node applications.

It allows you to

- Store a centralised state of your application
- Apply optmistic changes from UI interactions
- Validate those changes against a server response - even if it arrives too late
- //LATER Supports undo / redo
- //LATER Supports draft state
- Offers way to deal with conflicts: for instance, if the user draft is different than a backend response because another user modified the same document.

It's a perfect solution to deal with complex state in online live-editing applications.


## Usage

```tsx
<TransatProvider
    loadingState={{loading: true}}
    fetchState={() => {
        return fetchMyServer('/getFullState'); // returns {hello: 'world'}
    }}
    historyDepth={Infinity}
>
    <MyApp/>
</TransatProvider>
```

later:
```tsx
    const MyComponentThatCanModifyTheState = () => {

        const {
            state,
            setState, // you can set state manually
            dispatch, // or use a reducer pattern
            setDraft,
            dispatchDraft,
            undo,
            redo,
        } = useTransat();


        const onType = useCallback((value) => {
            const transaction = setState({...state, hello: value});
            fetchMyServer('/setHello?value=' + value).then((transatValidationToken) => {
                //verifies that both client and server have the same value;
                transaction.validate(transatValidationToken, {
                    onConflict: 'CANCEL' // or 'REBASE' or custom function,
                }); 
               
            }).catch(error => {
                //you could also freeze the UI and show an error message to the user saying connection lost for instance, and try again.
                transaction.cancel();

            })
        },[state]);


        return <input onChange={onType} value={state.hello}>
    }
```

on your backend:

```typescript
import {generateValidationToken} from 'transat';

//setHelloRoute
const handler = async (req: Request, res: Response) => {
    await db.update({
        hello: req.query.value,
        version: { //this is a required field in your state.
            increment: 1
        }
    });

    const fullState = await db.getFullState(); //obviously you would just want the scope of what your application has locally.

    const validationToken = generateValidationToken(fullState);

    res.status(200).send(validationToken)
}

```

## How does that work

When the users types a letter in the input field, the state is updated automatically,
and the previous version is stored in the history.

A request is sent to the server to do the change, and when the server replies, a hash and version number is used to verify that both client and server applied the transaction in the same fashion. 

**if the transaction is invalid**, for instance another client updated the same value in a separate browser, in this example we say to CANCEL, aka the client will refetch the entire state and replace whatever the user has done. But we could also show an error message, or REBASE which would reapply our user change on top of the latest version of the server. We could even provide a custom conflict function that would detect that one user added letters at the begginning of the word and one at the end, so we can merge those two changes.

**if the user types faster than the server can response**, it is no problem. The validation will be made against the history. In a happy path, all successive history version are validated. In an unhappy path, the onConflict strategies are applied.

## API

### TransatProvider
The provider component to put at the root of the application

Props:

- **state** : the full state of your application that will be used on initial load. Optional as you can use "fetchState" instead.
- **reducer**: [optional] a reducer function that will be used with "dispatch" calls in useTransat.
- **fetchState**: async function that fetches the state from your server. Will be used on initial mount if state is not specified, and will be used whenever there is a conflict to refetch the latest state.
- **fetchStateInterval**: [optional] specify an interval in ms to call the fetchState function.
- **loadingState**: [optional] state that will be used until **state** is non-null or **fetchState** has returned a non-null value
- **errorState**: [optional] state that will be used if fetchState errors
- **historyDepth** [optional] how far back can the user redo. Default is Infinity but beware of memory leaks on heavy state. Note that until they have been validated by the server, all changes are stored regardless of this setting.
- **forbidSetState** [optional] if you want to force the use of the reducer pattern
- **immutable** [optional] this will load immerjs under the hood to force your state being immutable, preventing potential bug if you use for instance a sort() that modifies the underlying object at the cost of performance.

## useTransat
The transat hook can be used anywhere as long as the TransatProvider is up in the tree.

returns an object with the following properties

- **state** : the full state of your application. Feel free to use a *select* pattern with an external library if you want to get a specific slice of state.
- **draftState**?: the full state of your application with added local modifications from the user that have not been sent to the server yet.

- **setState**: modifies the state of the application to the passed value, returns a **transaction** object.
- **dispatch**: modifies the state of the application with the passed ACTION. expects **reducer** to have been passed in TransatProvider. returns a **transaction** object.
- **setDraft**: like setState, but puts it in a special "draftState"
- **dispatchDraft**, like dispatch but modifies the draft instead
- **undo**, reverts to the previous state in the history


## Transaction object
returned from setState, dispatch, setDraft or dispatchDraft

has the following properties

- **validate** (token: TransatValidationToken, options?: {onConflict: 'CANCEL' | 'REBASE' | <T>(oldVersion: T, newVersion: T) => T)}
- **cancel** () => void; // removes that transaction from the history, and Rebase any future changes without it. 

