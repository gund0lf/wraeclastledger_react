import { contextBridge, ipcRenderer } from 'electron';
import type { Wp14BenchmarkApi } from '../shared/wp14Benchmark';

const api: Wp14BenchmarkApi = {
  readFixture: (fileName) => ipcRenderer.invoke('wp14-bench:read-fixture', fileName),
  setSaveBaseline: (caseId, revision, payloadJson) =>
    ipcRenderer.invoke('wp14-bench:set-baseline', caseId, revision, payloadJson),
  save: (serializedRequest) => ipcRenderer.invoke('wp14-bench:save', serializedRequest),
  finish: (rendererResults) => ipcRenderer.invoke('wp14-bench:finish', rendererResults),
  fail: (message) => ipcRenderer.invoke('wp14-bench:fail', message),
};

contextBridge.exposeInMainWorld('wp14Bench', api);
