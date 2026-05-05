const output = document.getElementById("output");
const simulationConsole = document.getElementById("simulationConsole");
const consoleToggle = document.getElementById("consoleToggle");
const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.29.3/full/";

if (simulationConsole && consoleToggle) {
  consoleToggle.addEventListener("click", function() {
    const isCollapsed = simulationConsole.classList.toggle("is-collapsed");
    consoleToggle.setAttribute("aria-expanded", String(!isCollapsed));
    consoleToggle.setAttribute("aria-label", isCollapsed ? "Expand console" : "Collapse console");
    consoleToggle.setAttribute("title", isCollapsed ? "Expand console" : "Collapse console");
  });
}

$(document).ready(function() {
  $.get('game.py', function(data) {
    evaluatePython(data);
  });
});

OUTPUT_PATCH = `
import sys
import io
sys.stdout = io.StringIO()
from js import addToOutput
orig_print = print
# redirect print via output textarea and console
def new_print(*args, **kwargs):
  stdout_len = len(sys.stdout.getvalue())
  orig_print(*args, **kwargs)
  stdout = sys.stdout.getvalue()
  addToOutput(stdout[stdout_len:])
  sys.stdout.flush()
print = new_print
`

INPUT_PATCH = `
from js import input_patch
input = input_patch
__builtins__.input = input_patch
`

function addToOutput(s) {
  output.value += s;
  output.scrollTop = output.scrollHeight;
  console.log(s);
}

window.onerror = function(msg, url, lineNo, columnNo, error) {
  try {
    addToOutput("Error occurred: to view, run page in new tab & use ctrl-shift-j to view console");  
    pyodide.runPython("window.clearInterval(intervalHandle)");  
  } catch(err) {}
};

addToOutput('Initializing...\n');
// init Pyodide

var pyodide = undefined;
async function main(){
  pyodide = await loadPyodide({
    indexURL: PYODIDE_INDEX_URL
  });
  addToOutput('Ready!\n');
}

function input_patch(text) {
    return prompt(text);
};


pyodideReadyPromise = main();

async function evaluatePython(code) {
  await pyodideReadyPromise;
  await pyodide.runPythonAsync(OUTPUT_PATCH);
  await pyodide.runPythonAsync(INPUT_PATCH);
      
  try {
    await pyodide.runPythonAsync(code);
  } catch(err) {
    addToOutput(err);
  }
}






