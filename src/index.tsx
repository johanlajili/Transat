import React, { useCallback, useEffect } from "react";

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

export const createTransat = <T extends unknown>() => {
    const StateContext = React.createContext<{state: T | null, setState: (value: T) => void} | null>(null);
    
    const TransatProvider = (
        props: TransatProviderProps<T>
      ) => {
        const [state, setState] = React.useState<T | null>(null);
      
        const transatSetState = useCallback((value: T) => {
            setState(value);
        }, [])
       
        useEffect(() => {
          props.fetchState().then((state) => {
            setState(state);
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

