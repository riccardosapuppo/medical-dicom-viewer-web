document.getElementById("salva").addEventListener("click", async () => {
    chrome.runtime.sendMessage({ action: "salva" });
});

document.getElementById("ripristina").addEventListener("click", async () => {
    chrome.runtime.sendMessage({ action: "ripristina" });
});
