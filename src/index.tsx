import React, { useCallback, useEffect } from "react";
import hash from 'string-hash'
type TransatProviderProps<T> = {
  children: React.ReactNode;
  fetchState: () => Promise<T>;
  state?: T;
  loadingState?: T;
  errorState?: T;
  reducer?: (state: T, action: any) => T;
  fetchStateInterval?: number;
  historyDepth?: number;
};


type TransatToken = {
    version: number;
    hash: number;
}

type TransatValidate<T> = (token: TransatToken, options?: {
    onConflict: 'REBASE' | 'CANCEL' | ((a: T, b: T) => T),
}) => {success: boolean, error?: string};


type TransatSetState<T> = (state: T) => {
    cancel: () => void;
    validate: TransatValidate<T>;
};
type TransatContext<T> = {
    state: T | null;
    setState: TransatSetState<T>;
}

export const createTransat = <T extends {version: number}>() => {
    const StateContext = React.createContext<TransatContext<T> | null>(null);
    
    const TransatProvider = (
        props: TransatProviderProps<T>
      ) => {
        const [state, setState] = React.useState<T | null>(null);
        const history = React.useRef<T[]>([]);
        
        const revertToHistoryIndex = useCallback((index: number) => {
            const current = history.current[index];
            setState({...current});

        } , [history, setState]);

        const transatSetState = useCallback((value: T) => {
            
            const historyIndex = history.current.length - 1;
            
            setState(value);
            history.current.push(value);

            const result: ReturnType<TransatSetState<T>> = {
                cancel : () => {
                    revertToHistoryIndex(historyIndex);
                },
                validate: (token, options) => {
                    const versionSuccess = token.version === value.version;
                    const hashSuccess = token.hash === hash(JSON.stringify(value));
                    const success =  versionSuccess && hashSuccess; 
                    
                    const onConflict = options?.onConflict ?? 'CANCEL';
                    if (!success) {
                        if (onConflict === 'REBASE') {
                            // revertToHistoryIndex(historyIndex);
                        } else if (onConflict === 'CANCEL') {
                            props.fetchState().then((state) => {
                                setState(state);
                                history.current.push(state);
                             });
                        } else {
                            const newState = onConflict(history.current[historyIndex], value);
                            setState(newState);
                        }
                    }
                    return {
                        success: success
                    }
                }
            }
            return result;
        }, [history, state, revertToHistoryIndex])
       
        useEffect(() => {
          props.fetchState().then((state) => {
            setState(state);
            history.current.push(state);
          });
        }, [props.fetchState]);

        return (
          <StateContext.Provider value={{state, setState: transatSetState}}>
            {props.children}
          </StateContext.Provider>
        );
      };
    
    const useTransat = () => {
        const context = React.useContext(StateContext);
        
        if (context === null) {
            throw new Error("useTransat must be used within a TransatProvider");
        }

        return { state: context.state, setState: context.setState };
    };

    return { TransatProvider, useTransat };
}

export const calculateVerificationToken= <T extends {version: number}>(state: T) => {
    return {
        version: state.version,
        hash: hash(JSON.stringify(state))
    }
}

