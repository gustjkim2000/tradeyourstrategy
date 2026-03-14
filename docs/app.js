const splashScreen = document.querySelector("#splashScreen");
const enterButton = document.querySelector("#enterButton");
const authAccountReveal = document.querySelector("#authAccountReveal");

function enterSite() {
  splashScreen.classList.add("is-hidden");
  document.body.classList.remove("intro-active");
}

enterButton.addEventListener("click", enterSite);

splashScreen.addEventListener("click", (event) => {
  if (event.target === splashScreen) {
    enterSite();
  }
});

splashScreen.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    enterSite();
  }
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-account-toggle='auth']");
  if (!target) {
    return;
  }

  authAccountReveal.classList.toggle("is-hidden");
});
