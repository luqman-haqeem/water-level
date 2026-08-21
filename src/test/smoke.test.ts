describe("test infrastructure", () => {
    it("runs a basic assertion", () => {
        expect(1 + 1).toBe(2);
    });

    it("has access to jsdom environment", () => {
        const div = document.createElement("div");
        div.textContent = "hello";
        expect(div.textContent).toBe("hello");
    });

    it("has jest-dom matchers available", () => {
        const div = document.createElement("div");
        div.setAttribute("data-testid", "test");
        document.body.appendChild(div);
        expect(div).toBeInTheDocument();
        document.body.removeChild(div);
    });
});
