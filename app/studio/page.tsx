export default function StudioPage() {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#000",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 1000,
            textAlign: "center",
            display: "grid",
            gap: 24,
          }}
        >
          <h1
            className="font-head"
            style={{
              fontSize: 60,
              margin: 0,
              letterSpacing: 2,
            }}
          >
            ENTER
          </h1>
  
          <div
            style={{
              height: 320,
              background: "#d9d9d9",
            }}
          />
  
          <h1
            className="font-head"
            style={{
              fontSize: 60,
              margin: 0,
              letterSpacing: 2,
            }}
          >
            STUDIO
          </h1>
        </div>
      </main>
    );
  }