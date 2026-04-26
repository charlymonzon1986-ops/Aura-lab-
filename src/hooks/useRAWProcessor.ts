// src/hooks/useRAWProcessor.ts
import { useState, useCallback } from 'react';
import { processRAWFile, RAWProcessResult, RAWProcessingError } from '../lib/rawProcessor';

interface RAWProcessorState {
  isProcessing: boolean;
  error: RAWProcessingError | null;
  result: RAWProcessResult | null;
}

export function useRAWProcessor() {
  const [state, setState] = useState<RAWProcessorState>({
    isProcessing: false,
    error: null,
    result: null,
  });

  const process = useCallback(async (file: File) => {
    setState({ isProcessing: true, error: null, result: null });
    
    try {
      const result = await processRAWFile(file);
      setState({ isProcessing: false, error: null, result });
      return result;
    } catch (err) {
      const error = err instanceof RAWProcessingError 
        ? err 
        : new RAWProcessingError('UNSUPPORTED_FORMAT', (err as Error).message);
      
      setState({ isProcessing: false, error, result: null });
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ isProcessing: false, error: null, result: null });
  }, []);

  return {
    ...state,
    process,
    reset
  };
}
