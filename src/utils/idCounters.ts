let idCounter = 3;
export const getNextId = () => `node_${idCounter++}`;
export const resetIdCounter = (max: number) => { idCounter = max; };

let stateNameCounter = 3;
export const getNextStateName = () => `S${stateNameCounter++}`;
export const resetStateNameCounter = (max: number) => { stateNameCounter = max; };

let decisionNameCounter = 1;
export const getNextDecisionName = () => `D${decisionNameCounter++}`;
export const resetDecisionNameCounter = (max: number) => { decisionNameCounter = max; };

let proxyNameCounter = 1;
export const getNextProxyName = () => `P${proxyNameCounter++}`;
export const resetProxyNameCounter = (max: number) => { proxyNameCounter = max; };
