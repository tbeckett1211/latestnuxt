process.env.NODE_ENV =
  process.env.ELECTRON_DEV === "true"
    ? "development"
    : process.env.NODE_ENV || "production";
console.log("NODE_ENV:", process.env.NODE_ENV);

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const treeKill = require("tree-kill");
const fs = require("fs");
const http = require("http");

let frontProcess;
let mainWindow;

function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

function getPath() {
  if (isDevelopment()) {
    return path.join(__dirname, "../", ".output", "server", "index.mjs");
  } else {
    return "resources/app/.output/server/index.mjs";
  }
}

function waitForServer(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      http
        .get(url, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else if (Date.now() - start > timeout) {
            reject(new Error("Timeout waiting for server"));
          } else {
            setTimeout(check, 500);
          }
        })
        .on("error", () => {
          if (Date.now() - start > timeout) {
            reject(new Error("Timeout waiting for server"));
          } else {
            setTimeout(check, 500);
          }
        });
    })();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDevelopment()) {
    mainWindow.loadURL("http://localhost:3000");
    return;
  }

  // ✅ 1. Show loading page first
  mainWindow.loadFile(path.join(__dirname, "loading.html"));

  const frontPath = getPath();
  console.log("Using Nuxt server file:", frontPath);

  if (!fs.existsSync(frontPath)) {
    console.error("Nuxt server file missing:", frontPath);
    dialog.showErrorBox(
      "Nuxt Build Missing",
      `Could not find Nuxt server file at:\n${frontPath}`
    );
    app.quit();
    return;
  }

  frontProcess = spawn("node", [frontPath], {
    detached: false,
    stdio: "ignore",
    windowsHide: true,
  });

  console.log(`Started Nuxt server, pid: ${frontProcess.pid}`);

  try {
    await waitForServer("http://localhost:3000");
    console.log("Nuxt server ready, loading URL...");
    mainWindow.loadURL("http://localhost:3000");
  } catch (e) {
    console.error("Failed to connect to Nuxt server:", e);
    dialog.showErrorBox("Nuxt server error", e.message || e);
    app.quit();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function killAllProcesses() {
  return new Promise((resolve) => {
    if (!frontProcess) return resolve();
    treeKill(frontProcess.pid, "SIGKILL", (err) => {
      if (!err) console.log(`Killed process ${frontProcess.pid}`);
      resolve();
    });
  });
}

async function handleShutdown() {
  console.log("Shutting down...");
  try {
    await killAllProcesses();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  } catch (err) {
    console.error("Error during shutdown:", err);
  } finally {
    app.quit();
  }
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);
process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") handleShutdown();
});

app.whenReady().then(createWindow);

//////////////// CUSTOM FUNCTIONS
ipcMain.on("app-quit", () => {
  console.log("Quitting app...");
  app.quit();
});
