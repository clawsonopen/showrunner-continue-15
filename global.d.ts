
interface Window {
  aistudio?: {
    hasSelectedApiKey: () => Promise<boolean>;
    fetchSelectedApiKey: () => Promise<string>;
    openSelectKey: () => Promise<void>;
  };
}
