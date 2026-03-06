document.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(window.location.search);
    const clientSlug = window.location.pathname.split("/").pop();

    try {
        const response = await fetch(`/api/clients/slug/${clientSlug}`);
        const client = await response.json();

        if (client) {
            // Apply Theme Color to UI Elements
            const themeColor = client.themeColor || "#FFD700";
            
            // 1. Update Buttons
            const buttons = document.querySelectorAll(".btn-primary, .action-button, .save-contact-btn");
            buttons.forEach(btn => {
                btn.style.backgroundColor = themeColor;
                btn.style.borderColor = themeColor;
            });

            // 2. Update Icons/Accents
            const icons = document.querySelectorAll(".social-icon, .info-icon");
            icons.forEach(icon => {
                icon.style.color = themeColor;
            });

            // 3. Dynamic Stylesheet Injection (The Pro Touch)
            const style = document.createElement("style");
            style.innerHTML = `
                .profile-header { border-bottom: 3px solid ${themeColor}; }
                .contact-item:hover { background-color: ${themeColor}1a; } /* 10% opacity */
            `;
            document.head.appendChild(style);
            
            console.log("✅ Theme applied:", themeColor);
        }
    } catch (err) {
        console.error("❌ Error loading vCard theme:", err);
    }
});