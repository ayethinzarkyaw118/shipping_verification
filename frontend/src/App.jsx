import { useEffect, useState } from "react";
import { animate } from "animejs";


const fallbackData = {
  email_id: "EMAIL001",
  category: "document_comparison",
  status: "discrepancy_found",

  email: {
    sender: "customer@example.com",
    subject: "Draft BL Verification",
    date: "2026-09-20",
  },

  si: {
    shipper: "ABC Shipping Ltd",
    consignee: "XYZ Trading Ltd",
    notify_party: "XYZ Trading Ltd",
    port_of_loading: "Port Klang",
    port_of_discharge: "Hamburg",
    container_count: 3,
    gross_weight_kg: 24500,
  },

  bl: {
    shipper: "ABC Shipping Ltd",
    consignee: "XYZ Trading Ltd",
    notify_party: "XYZ Trading Ltd",
    port_of_loading: "Port Klang",
    port_of_discharge: "Hamburg",
    container_count: 4,
    gross_weight_kg: 24500,
  },

  discrepancies: [
    {
      field: "container_count",
      si_value: 3,
      bl_value: 4,
    },
  ],

  confidence: 0.96,
};

const fields = [
  ["shipper", "Shipper"],
  ["consignee", "Consignee"],
  ["notify_party", "Notify Party"],
  ["port_of_loading", "Port of Loading"],
  ["port_of_discharge", "Port of Discharge"],
  ["container_count", "Container Count"],
  ["gross_weight_kg", "Gross Weight"],
];

function App() {
  const [page, setPage] = useState("inbox");
  const [liveData, setLiveData] = useState(null);
  const [emails, setEmails] = useState([]);
  const [checkedResults, setCheckedResults] = useState({});
  const [loadingEmailId, setLoadingEmailId] = useState("");
  const [apiOnline, setApiOnline] = useState(false);
  const [apiError, setApiError] = useState("");
  const [reviewStatus, setReviewStatus] = useState("pending");
  const [showCorrect, setShowCorrect] = useState(false);
  const [correctValue, setCorrectValue] = useState("4");
  const [blContainerCount, setBlContainerCount] = useState(
    fallbackData.bl.container_count
  );

  const mockData = liveData || fallbackData;

  useEffect(() => {
    let cancelled = false;

    const loadBackend = async () => {
      try {
        const [healthResponse, emailsResponse] = await Promise.all([
          fetch("/health"),
          fetch("/emails"),
        ]);

        if (!healthResponse.ok || !emailsResponse.ok) {
          throw new Error("Backend request failed");
        }

        const inbox = await emailsResponse.json();

        if (!cancelled) {
          setApiOnline(true);
          setEmails(Array.isArray(inbox) ? inbox : []);
        }
      } catch {
        if (!cancelled) {
          setApiOnline(false);
          setApiError("Backend connection unavailable");
        }
      }
    };

    loadBackend();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    animate(".content > *", {
      opacity: [0, 1],
      translateY: [30, 0],
      duration: 700,
      ease: "out(4)",
      delay: 60,
    });
  }, [page]);

  useEffect(() => {
    if (liveData?.bl?.container_count != null) {
      setBlContainerCount(Number(liveData.bl.container_count));
      setCorrectValue(String(liveData.bl.container_count));
    }
  }, [liveData]);

  const currentBL = {
    ...mockData.bl,
    container_count: blContainerCount,
  };

  const isMismatch = (field) =>
    mockData.si[field] !== currentBL[field];

  const discrepancyCount = fields.filter(
    ([key]) => isMismatch(key)
  ).length;

  const matchingCount = fields.filter(
    ([key]) => !isMismatch(key)
  ).length;

  const hasPendingReview = reviewStatus === "pending";

  const checkedValues = Object.values(checkedResults);
  const checkedComparisonCount = checkedValues.filter(
    (result) => result.category === "BL_COMPARISON"
  ).length;
  const checkedMatchedCount = checkedValues.filter(
    (result) =>
      result.category === "BL_COMPARISON" &&
      !result.mismatch_found &&
      !result.needs_review
  ).length;
  const checkedReviewCount = checkedValues.filter(
    (result) => result.needs_review || result.mismatch_found
  ).length;

  const categoryLabel = (category) => {
    const labels = {
      BL_COMPARISON: "Document Comparison",
      SI_REQUEST: "New SI Request",
      INVOICE_QUERY: "Invoice Query",
      GENERAL: "General",
      SPAM: "Spam",
    };

    return labels[category] || "Not checked";
  };

  const applyComparisonResult = (email, result) => {
    setLiveData({
      email_id: result.email_id,
      category: result.category,
      status: result.needs_review
        ? "needs_review"
        : result.mismatch_found
        ? "discrepancy_found"
        : "verified",
      email: {
        sender: email.from || email.from_ || "Unknown sender",
        subject: email.subject || "Shipping document verification",
        date: email.date || "Current inbox",
      },
      si: result.si_fields || fallbackData.si,
      bl: result.bl_fields || fallbackData.bl,
      discrepancies: result.mismatches || [],
      confidence: 0.96,
      needs_review: Boolean(result.needs_review),
      summary: result.summary,
    });

    setReviewStatus(
      result.needs_review || result.mismatch_found
        ? "pending"
        : "approved"
    );
    setPage("verification");
  };

  const checkEmail = async (email) => {
    const cached = checkedResults[email.email_id];

    if (cached) {
      if (cached.category === "BL_COMPARISON") {
        applyComparisonResult(email, cached);
      }
      return;
    }

    setLoadingEmailId(email.email_id);

    try {
      const response = await fetch(
        `/results/${encodeURIComponent(email.email_id)}`
      );

      if (!response.ok) {
        throw new Error("Could not check email");
      }

      const result = await response.json();

      setCheckedResults((current) => ({
        ...current,
        [email.email_id]: result,
      }));

      if (result.category === "BL_COMPARISON") {
        applyComparisonResult(email, result);
      }
    } catch {
      setApiError(`Could not check ${email.email_id}`);
    } finally {
      setLoadingEmailId("");
    }
  };

  const formatValue = (field, value) => {
    if (value === null || value === undefined || value === "") {
      return "Not available";
    }

    if (field === "gross_weight_kg") {
      const numeric = Number(value);
      return `${Number.isFinite(numeric) ? numeric.toLocaleString() : value} kg`;
    }

    if (field === "container_count") {
      return `${value} containers`;
    }

    return value;
  };

  const resolveCurrentReview = async () => {
    if (!mockData.email_id) return;

    try {
      await fetch(
        `/review-queue/${encodeURIComponent(mockData.email_id)}/resolve`,
        { method: "POST" }
      );
    } catch {
      // Keep the operator UI responsive even if persistence is unavailable.
    }
  };

  const handleApprove = async () => {
    await resolveCurrentReview();
    setReviewStatus("approved");
    setPage("inbox");
  };

  const handleReject = async () => {
    await resolveCurrentReview();
    setReviewStatus("rejected");
    setPage("inbox");
  };

  const handleCorrectValue = () => {
    if (!showCorrect) {
      setShowCorrect(true);
      return;
    }

    const newValue = Number(correctValue);

    if (!newValue || newValue < 1) {
      return;
    }

    setBlContainerCount(newValue);
    setReviewStatus("corrected");
    setShowCorrect(false);
    setPage("inbox");
  };

  const pageTitle = {
    inbox: "Shipping Operations",
    verification: "Document Verification",
    review: "Human Review",
    dashboard: "Operations Overview",
  };

  const pageSubtitle = {
    inbox: "Monitor and classify incoming shipping communications",
    verification: "AI-powered comparison and document validation",
    review: "Review cases requiring human confirmation",
    dashboard: "Real-time shipping verification performance",
  };

  return (
    <div className="app">

      <style>{`

        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Montserrat:wght@600;700;800;900&display=swap');

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family:
            "Inter",
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Arial,
            sans-serif;

          background: #f4f7fb;
          color: #101828;
        }

        button,
        input {
          font-family: inherit;
        }

        .app {
          min-height: 100vh;

          background:
            radial-gradient(
              circle at 80% 0%,
              rgba(20,184,166,.08),
              transparent 25%
            ),
            #f4f7fb;
        }

        .brand-text h1,
        .page-heading h1,
        .topbar-left h2,
        .verification-header h1,
        .review-card h3,
        .resolved-card h3,
        .document-title,
        .stat-number {
          font-family: "Montserrat", "Inter", sans-serif;
          font-weight: 800;
        }

        /* =========================
           SIDEBAR
        ========================= */

        .sidebar {
          width: 270px;
          min-height: 100vh;

          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;

          padding: 25px 16px;

          background:
            radial-gradient(
              circle at 20% 0%,
              rgba(25,199,163,.08),
              transparent 28%
            ),
            linear-gradient(
              180deg,
              #07101d 0%,
              #0b1220 55%,
              #09111d 100%
            );

          color: white;
          z-index: 10;

          border-right:
            1px solid rgba(255,255,255,.07);

          box-shadow:
            12px 0 40px rgba(3,10,20,.08);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 13px;

          padding: 5px 11px 30px;

          position: relative;
        }

        .brand-icon {
          width: 46px;
          height: 46px;

          flex-shrink: 0;

          border-radius: 14px;

          display: flex;
          align-items: center;
          justify-content: center;

          background:
            linear-gradient(
              135deg,
              #19c7a3,
              #1683d8
            );

          color: white;

          box-shadow:
            0 10px 28px rgba(25,199,163,.25);

          font-size: 22px;
          font-weight: 900;

          border:
            1px solid rgba(255,255,255,.14);
        }

        .brand-text h1 {
          margin: 0;

          color: #ffffff;

          font-family:
            "Montserrat",
            "Inter",
            sans-serif;

          font-size: 20px;
          line-height: 1;

          font-weight: 900;

          letter-spacing: 1.4px;
        }

        .brand-text span {
          display: block;

          color: #8fa0b5;

          font-size: 9px;

          margin-top: 7px;

          letter-spacing: 1.1px;

          font-weight: 700;
        }

        .brand-line {
          position: absolute;

          left: 12px;
          right: 12px;
          bottom: 0;

          height: 1px;

          background:
            linear-gradient(
              90deg,
              rgba(25,199,163,.35),
              rgba(255,255,255,.05),
              transparent
            );
        }

        .nav-title {
          padding: 29px 13px 11px;

          color: #66788f;

          font-size: 9px;

          font-weight: 800;

          letter-spacing: 1.7px;

          text-transform: uppercase;
        }

        .nav-button {
          width: 100%;

          border:
            1px solid transparent;

          background: transparent;

          color: #91a0b4;

          display: flex;
          align-items: center;

          gap: 13px;

          padding: 13px;

          border-radius: 12px;

          cursor: pointer;

          margin-bottom: 5px;

          text-align: left;

          font-size: 13px;

          font-weight: 600;

          transition: .2s ease;

          position: relative;
        }

        .nav-button:hover {
          background:
            rgba(255,255,255,.055);

          color: #ffffff;

          transform: translateX(2px);
        }

        .nav-button.active {
          color: #ffffff;

          background:
            linear-gradient(
              100deg,
              rgba(25,199,163,.19),
              rgba(22,131,216,.10)
            );

          border:
            1px solid rgba(77,224,191,.13);

          box-shadow:
            inset 3px 0 0 #19c7a3,
            0 8px 22px rgba(0,0,0,.10);
        }

        .nav-button.active:after {
          content: "";

          position: absolute;

          right: 13px;

          width: 5px;
          height: 5px;

          border-radius: 50%;

          background: #4de0bf;

          box-shadow:
            0 0 0 4px rgba(77,224,191,.08);
        }

        .nav-icon {
          width: 25px;

          text-align: center;

          font-size: 16px;

          color: #71839a;
        }

        .nav-button.active .nav-icon {
          color: #4de0bf;
        }

        .review-count {
          margin-left: auto;

          min-width: 24px;
          height: 22px;

          display: flex;

          align-items: center;
          justify-content: center;

          border-radius: 7px;

          background:
            rgba(247,144,9,.13);

          color: #ffb454;

          border:
            1px solid rgba(247,144,9,.18);

          font-size: 9px;

          font-weight: 800;
        }

        .sidebar-bottom {
          position: absolute;

          left: 16px;
          right: 16px;
          bottom: 22px;

          padding: 15px;

          border-radius: 13px;

          background:
            linear-gradient(
              135deg,
              rgba(255,255,255,.055),
              rgba(255,255,255,.025)
            );

          border:
            1px solid rgba(255,255,255,.08);

          box-shadow:
            0 8px 25px rgba(0,0,0,.10);
        }

        .online {
          display: flex;
          align-items: center;

          gap: 9px;

          color: #d5deea;

          font-size: 11px;

          font-weight: 600;
        }

        .online-text {
          display: flex;
          flex-direction: column;

          gap: 2px;
        }

        .online-text small {
          color: #65758a;

          font-size: 8px;

          letter-spacing: .5px;
        }

        .dot {
          width: 8px;
          height: 8px;

          flex-shrink: 0;

          border-radius: 50%;

          background: #19c7a3;

          box-shadow:
            0 0 0 5px rgba(25,199,163,.09),
            0 0 15px rgba(25,199,163,.35);
        }

        /* =========================
           MAIN
        ========================= */

        .main {
          margin-left: 270px;

          min-height: 100vh;
        }

        .topbar {
          min-height: 82px;

          background:
            rgba(255,255,255,.96);

          backdrop-filter:
            blur(12px);

          border-bottom:
            1px solid #e8edf3;

          display: flex;

          align-items: center;

          justify-content: space-between;

          padding:
            0 40px;

          position: sticky;

          top: 0;

          z-index: 5;
        }

        .topbar-left {
          display: flex;

          flex-direction: column;

          gap: 4px;
        }

        .breadcrumb {
          display: flex;

          align-items: center;

          gap: 7px;

          color: #98a2b3;

          font-size: 9px;

          font-weight: 700;

          text-transform: uppercase;

          letter-spacing: .9px;
        }

        .breadcrumb-active {
          color: #19a88c;
        }

        .topbar-left h2 {
          margin: 0;

          color: #101828;

          font-family:
            "Montserrat",
            "Inter",
            sans-serif;

          font-size: 21px;

          line-height: 1.1;

          font-weight: 800;

          letter-spacing: -.45px;
        }

        .topbar-left p {
          margin: 0;

          color: #667085;

          font-size: 10px;

          font-weight: 500;
        }

        .topbar-right {
          display: flex;

          align-items: center;

          gap: 14px;
        }

        .system-chip {
          display: flex;

          align-items: center;

          gap: 7px;

          padding: 7px 10px;

          border-radius: 20px;

          background: #f0fbf8;

          border:
            1px solid #d8f1eb;

          color: #087f68;

          font-size: 9px;

          font-weight: 800;
        }

        .system-chip-dot {
          width: 6px;
          height: 6px;

          border-radius: 50%;

          background: #12b76a;
        }

        .avatar {
          width: 39px;
          height: 39px;

          border-radius: 12px;

          background:
            linear-gradient(
              135deg,
              #dff8f1,
              #eaf4ff
            );

          color: #087f68;

          display: flex;

          align-items: center;
          justify-content: center;

          font-size: 11px;

          font-weight: 850;

          border:
            1px solid #c5eee5;
        }

        .content {
          padding:
            34px 40px 55px;

          max-width: 1500px;
        }

        .page-heading {
          display: flex;

          align-items: flex-end;

          justify-content: space-between;

          margin-bottom: 25px;
        }

        .page-heading h1 {
          margin: 0;

          font-family:
            "Montserrat",
            "Inter",
            sans-serif;

          font-size: 29px;

          letter-spacing: -.8px;

          font-weight: 800;
        }

        .page-heading p {
          margin: 7px 0 0;

          color: #667085;

          font-size: 13px;
        }

        /* =========================
           BADGES
        ========================= */

        .badge {
          display: inline-flex;

          align-items: center;

          gap: 5px;

          border-radius: 30px;

          padding: 7px 11px;

          font-size: 10px;

          font-weight: 700;

          white-space: nowrap;
        }

        .badge-warning {
          color: #b54708;

          background: #fff7e6;

          border:
            1px solid #fedf89;
        }

        .badge-success {
          color: #087443;

          background: #ecfdf3;

          border:
            1px solid #c6f0d9;
        }

        .badge-neutral {
          color: #475467;

          background: #f2f4f7;
        }

        /* =========================
           STATS
        ========================= */

        .stats {
          display: grid;

          grid-template-columns:
            repeat(4, 1fr);

          gap: 15px;

          margin-bottom: 23px;
        }

        .stat-card {
          background:
            rgba(255,255,255,.94);

          border:
            1px solid #e7ecf2;

          border-radius: 15px;

          padding: 19px;

          box-shadow:
            0 5px 20px rgba(16,24,40,.035);

          transition: .2s ease;
        }

        .stat-card:hover {
          transform: translateY(-2px);

          box-shadow:
            0 10px 25px rgba(16,24,40,.07);
        }

        .stat-top {
          display: flex;

          justify-content: space-between;

          align-items: center;
        }

        .stat-label {
          color: #667085;

          font-size: 11px;

          font-weight: 600;
        }

        .stat-number {
          font-size: 28px;

          font-weight: 800;

          margin-top: 11px;

          letter-spacing: -.7px;
        }

        .stat-icon {
          width: 37px;
          height: 37px;

          border-radius: 10px;

          background: #effaf7;

          color: #087f68;

          display: flex;

          align-items: center;
          justify-content: center;

          font-size: 16px;
        }

        /* =========================
           PANELS
        ========================= */

        .panel {
          background: white;

          border:
            1px solid #e7ecf2;

          border-radius: 17px;

          box-shadow:
            0 5px 20px rgba(16,24,40,.035);

          overflow: hidden;
        }

        .panel-header {
          padding:
            19px 22px;

          border-bottom:
            1px solid #edf0f4;

          display: flex;

          justify-content: space-between;

          align-items: center;
        }

        .panel-header h3 {
          margin: 0;

          font-size: 14px;
        }

        .panel-header span {
          color: #667085;

          font-size: 11px;

          margin-top: 4px;

          display: block;
        }

        /* =========================
           EMAIL
        ========================= */

        .email-row {
          display: flex;

          align-items: center;

          gap: 15px;

          padding: 17px 22px;

          border-bottom:
            1px solid #f0f2f5;

          transition:
            background .2s ease,
            transform .2s ease;

          position: relative;
        }

        .email-row:last-child {
          border-bottom: 0;
        }

        .email-row:hover {
          background:
            linear-gradient(
              90deg,
              #fbfdfd,
              #f8fbfb
            );
        }

        .email-icon {
          width: 44px;
          height: 44px;

          flex-shrink: 0;

          border-radius: 12px;

          background:
            linear-gradient(
              135deg,
              #eef8ff,
              #f1f8ff
            );

          color: #1769d3;

          display: flex;

          align-items: center;
          justify-content: center;

          font-size: 16px;

          border:
            1px solid #dce9ff;

          box-shadow:
            0 4px 12px rgba(23,105,211,.05);
        }

        .email-main {
          flex: 1;

          min-width: 180px;
        }

        .email-main h4 {
          margin:
            0 0 5px;

          color: #172033;

          font-size: 13px;

          font-weight: 750;

          letter-spacing: -.15px;
        }

        .email-main p {
          margin: 0;

          color: #667085;

          font-size: 10px;

          font-weight: 500;
        }

        .email-category {
          font-size: 9px;

          color: #475467;

          background: #f5f7fa;

          border:
            1px solid #e8ecf1;

          padding:
            6px 9px;

          border-radius: 7px;

          margin-right: 0;

          font-weight: 650;

          white-space: nowrap;
        }

        .email-row .badge {
          padding:
            6px 9px;

          font-size: 9px;

          white-space: nowrap;
        }

        .email-actions {
          display: flex;

          align-items: center;

          gap: 7px;

          margin-left: 2px;
        }

        .email-actions .primary-btn,
        .email-actions .secondary-btn {
          min-width: 58px;

          text-align: center;
        }

        .email-priority {
          width: 6px;
          height: 6px;

          position: absolute;

          left: 8px;

          border-radius: 50%;

          background: #f79009;

          box-shadow:
            0 0 0 4px rgba(247,144,9,.08);
        }

        .email-row.needs-action {
          background:
            linear-gradient(
              90deg,
              rgba(255,247,237,.55),
              transparent 45%
            );
        }

        .email-row.needs-action:hover {
          background:
            linear-gradient(
              90deg,
              rgba(255,247,237,.9),
              #fafcfd 55%
            );
        }

        .email-row.classified .email-icon {
          background:
            linear-gradient(
              135deg,
              #effaf7,
              #eefcf8
            );

          color: #087f68;

          border-color:
            #d8f1eb;
        }

        .email-row.invoice .email-icon {
          background:
            linear-gradient(
              135deg,
              #f7f3ff,
              #f4f1ff
            );

          color: #6941c6;

          border-color:
            #e7defc;
        }

        .inbox-panel-header {
          display: flex;

          align-items: center;

          gap: 10px;
        }

        .inbox-count {
          display: inline-flex;

          align-items: center;
          justify-content: center;

          min-width: 23px;
          height: 23px;

          padding: 0 7px;

          border-radius: 20px;

          background: #f2f4f7;

          color: #475467;

          font-size: 9px;

          font-weight: 800;
        }

        .inbox-panel-meta {
          color: #98a2b3;

          font-size: 10px;

          font-weight: 600;
        }

        /* =========================
           BUTTONS
        ========================= */

        .primary-btn {
          border: 0;

          background: #101828;

          color: white;

          padding:
            10px 15px;

          border-radius: 9px;

          font-size: 11px;

          font-weight: 700;

          cursor: pointer;

          transition: .2s ease;
        }

        .primary-btn:hover {
          transform: translateY(-1px);

          background: #1d2939;
        }

        .secondary-btn {
          border:
            1px solid #d5dbe3;

          background: white;

          color: #344054;

          padding:
            9px 14px;

          border-radius: 9px;

          font-size: 11px;

          font-weight: 600;

          cursor: pointer;

          transition: .2s ease;
        }

        .secondary-btn:hover {
          background: #f8fafc;

          border-color: #b8c1ce;
        }

        /* =========================
           VERIFICATION HERO
        ========================= */

        .verification-header {
          position: relative;

          overflow: hidden;

          background:
            radial-gradient(
              circle at 85% 20%,
              rgba(25,199,163,.22),
              transparent 28%
            ),
            linear-gradient(
              135deg,
              #09111f,
              #15253a
            );

          color: white;

          border-radius: 20px;

          padding: 30px;

          margin-bottom: 18px;

          display: flex;

          justify-content: space-between;

          align-items: center;

          box-shadow:
            0 12px 35px rgba(9,17,31,.15);
        }

        .verification-header:after {
          content: "";

          position: absolute;

          width: 180px;
          height: 180px;

          border:
            1px solid rgba(255,255,255,.07);

          border-radius: 50%;

          right: 80px;
          top: -90px;
        }

        .verification-header h1 {
          margin: 0;

          font-family:
            "Montserrat",
            "Inter",
            sans-serif;

          font-size: 26px;

          letter-spacing: -.7px;

          color: #ffffff !important;

          position: relative;

          z-index: 1;

          font-weight: 800;
        }

        .verification-header p {
          margin: 7px 0 0;

          color: #aab7c8;

          font-size: 12px;

          position: relative;

          z-index: 1;
        }

        .confidence {
          position: relative;

          z-index: 2;

          min-width: 150px;

          text-align: right;
        }

        .confidence small {
          color: #91a0b4;

          display: block;

          margin-bottom: 4px;

          font-size: 10px;

          letter-spacing: .8px;

          font-weight: 700;
        }

        .confidence strong {
          font-size: 29px;

          color: #4de0bf;

          letter-spacing: -1px;
        }

        .confidence-bar {
          width: 100%;

          height: 5px;

          margin-top: 9px;

          border-radius: 20px;

          background:
            rgba(255,255,255,.12);

          overflow: hidden;
        }

        .confidence-fill {
          width: 96%;

          height: 100%;

          border-radius: 20px;

          background:
            linear-gradient(
              90deg,
              #19c7a3,
              #1683d8
            );
        }

        /* =========================
           VERIFICATION SUMMARY
        ========================= */

        .verification-summary {
          display: grid;

          grid-template-columns:
            1.5fr .8fr .8fr .9fr;

          gap: 12px;

          margin-bottom: 18px;
        }

        .verification-stat {
          background: white;

          border:
            1px solid #e5eaf0;

          border-radius: 14px;

          padding:
            15px 17px;

          box-shadow:
            0 4px 16px rgba(16,24,40,.035);
        }

        .verification-stat-label {
          color: #8a94a4;

          font-size: 9px;

          font-weight: 700;

          text-transform: uppercase;

          letter-spacing: .7px;
        }

        .verification-stat-value {
          margin-top: 6px;

          font-size: 18px;

          font-weight: 800;

          color: #172033;
        }

        .verification-stat-value.success {
          color: #087443;
        }

        .verification-stat-value.warning {
          color: #c2410c;
        }

        .verification-stat-main {
          display: flex;

          align-items: center;

          justify-content: space-between;
        }

        /* =========================
           COMPARISON
        ========================= */

        .comparison-wrapper {
          position: relative;
        }

        .comparison-label {
          display: flex;

          align-items: center;

          justify-content: center;

          gap: 10px;

          margin:
            0 auto -9px;

          position: relative;

          z-index: 3;

          width: max-content;

          padding:
            6px 11px;

          border-radius: 20px;

          background: #101828;

          color: white;

          font-size: 9px;

          font-weight: 800;

          letter-spacing: .8px;

          box-shadow:
            0 5px 15px rgba(16,24,40,.16);
        }

        .comparison-label span {
          color: #4de0bf;
        }

        .comparison {
          display: grid;

          grid-template-columns:
            1fr 1fr;

          gap: 17px;
        }

        .document-card {
          background: white;

          border:
            1px solid #e4e9ef;

          border-radius: 17px;

          overflow: hidden;

          box-shadow:
            0 5px 20px rgba(16,24,40,.035);
        }

        .document-title {
          padding:
            17px 20px;

          background:
            linear-gradient(
              180deg,
              #fbfcfd,
              #f7f9fb
            );

          border-bottom:
            1px solid #e7ecf2;

          font-family:
            "Montserrat",
            "Inter",
            sans-serif;

          font-weight: 800;

          font-size: 13px;
        }

        .document-title span {
          float: right;

          color: #8b95a5;

          font-weight: 700;

          font-size: 9px;

          letter-spacing: .8px;

          background: #edf1f5;

          padding:
            5px 7px;

          border-radius: 5px;
        }

        .field {
          min-height: 64px;

          padding:
            13px 20px;

          border-bottom:
            1px solid #f0f2f5;

          transition: .2s ease;
        }

        .field:last-child {
          border-bottom: 0;
        }

        .field-label {
          color: #8993a3;

          font-size: 10px;

          font-weight: 600;

          margin-bottom: 5px;

          text-transform: uppercase;

          letter-spacing: .35px;
        }

        .field-value {
          font-size: 13px;

          font-weight: 650;

          color: #172033;
        }

        .match-indicator {
          float: right;

          color: #087443;

          font-size: 10px;

          font-weight: 700;
        }

        .mismatch-indicator {
          float: right;

          color: #c2410c;

          font-size: 10px;

          font-weight: 800;

          background: #fff0df;

          padding:
            3px 6px;

          border-radius: 5px;
        }

        /* =========================
           MISMATCH
        ========================= */

        .mismatch-card {
          position: relative;

          overflow: hidden;

          margin-top: 17px;

          background:
            linear-gradient(
              135deg,
              #fffaf3,
              #fff7ed
            );

          border:
            1px solid #fed7aa;

          border-radius: 17px;

          padding: 21px;

          box-shadow:
            0 5px 20px rgba(245,158,11,.06);
        }

        .mismatch-card:before {
          content: "";

          position: absolute;

          left: 0;
          top: 0;
          bottom: 0;

          width: 4px;

          background: #f79009;
        }

        .mismatch-title {
          display: flex;

          align-items: center;

          gap: 9px;

          color: #c2410c;

          font-weight: 800;

          font-size: 14px;
        }

        .mismatch-field-name {
          color: #9a4b16;

          font-size: 10px;

          font-weight: 800;

          text-transform: uppercase;

          letter-spacing: .6px;

          margin-top: 14px;
        }

        .mismatch-content {
          display: grid;

          grid-template-columns:
            1fr 1fr;

          gap: 12px;

          margin-top: 14px;
        }

        .value-box {
          background: white;

          border:
            1px solid #fed7aa;

          border-radius: 11px;

          padding: 14px;
        }

        .value-box small {
          display: block;

          color: #8a5a35;

          font-size: 9px;

          font-weight: 700;

          letter-spacing: .7px;

          margin-bottom: 5px;
        }

        .value-box strong {
          font-size: 18px;

          color: #172033;
        }

        .review-action {
          margin-top: 15px;

          display: flex;

          justify-content: flex-end;
        }

        .review-action .primary-btn {
          padding:
            12px 18px;

          box-shadow:
            0 7px 18px rgba(16,24,40,.13);
        }

        /* =========================
           HUMAN REVIEW
        ========================= */

        .review-card {
          background: white;

          border:
            1px solid #e4e9ef;

          border-radius: 18px;

          padding: 28px;

          max-width: 900px;

          box-shadow:
            0 8px 25px rgba(16,24,40,.04);

          position: relative;
        }

        .case-label {
          position: absolute;

          top: 25px;
          right: 25px;

          padding:
            6px 10px;

          border-radius: 7px;

          background: #f2f4f7;

          color: #475467;

          font-size: 9px;

          font-weight: 800;

          letter-spacing: .7px;
        }

        .review-alert {
          background: #fff9eb;

          border:
            1px solid #fedf89;

          color: #b54708;

          padding: 16px;

          border-radius: 12px;

          margin-bottom: 22px;

          font-size: 12px;

          line-height: 1.5;

          text-align: center;
        }

        .review-alert strong {
          display: block;

          margin-bottom: 4px;

          font-size: 13px;
        }

        .review-card h3 {
          margin:
            0 0 5px;

          font-family:
            "Montserrat",
            "Inter",
            sans-serif;

          font-size: 22px;

          letter-spacing: -.4px;

          font-weight: 800;
        }

        .review-card > p {
          color: #667085;

          font-size: 12px;
        }

        .review-grid {
          display: grid;

          grid-template-columns:
            1fr 1fr;

          gap: 12px;

          margin:
            20px 0;
        }

        .review-box {
          border:
            1px solid #e6eaf0;

          padding: 20px;

          border-radius: 13px;

          background: #fbfcfd;

          text-align: center;

          transition: .2s ease;
        }

        .review-box:hover {
          transform: translateY(-2px);

          box-shadow:
            0 8px 18px rgba(16,24,40,.05);
        }

        .review-box.warning-box {
          background:
            linear-gradient(
              135deg,
              #fffaf3,
              #fff7ed
            );

          border-color: #fed7aa;
        }

        .review-box small {
          color: #667085;

          font-size: 10px;

          font-weight: 700;

          text-transform: uppercase;

          letter-spacing: .5px;
        }

        .review-box strong {
          display: block;

          margin-top: 8px;

          font-size: 17px;
        }

        .review-box.warning-box strong {
          color: #c2410c;
        }

        .actions {
          display: flex;

          gap: 9px;

          margin-top: 20px;
        }

        .approve {
          background: #087443;
        }

        .approve:hover {
          background: #066238;
        }

        .reject {
          background: #b42318;
        }

        .reject:hover {
          background: #912018;
        }

        .correct-section {
          margin-top: 18px;

          padding: 16px;

          border-radius: 12px;

          background: #f8fafc;

          border:
            1px solid #e4e9ef;
        }

        .correct-section label {
          display: block;

          color: #475467;

          font-size: 10px;

          font-weight: 700;

          margin-bottom: 8px;
        }

        .correct-row {
          display: flex;

          gap: 9px;
        }

        .correct-input {
          flex: 1;

          border:
            1px solid #d5dbe3;

          background: white;

          border-radius: 9px;

          padding: 10px 12px;

          font-size: 12px;

          outline: none;
        }

        .correct-input:focus {
          border-color: #19c7a3;

          box-shadow:
            0 0 0 3px rgba(25,199,163,.10);
        }

        .resolved-card {
          max-width: 900px;

          background: white;

          border:
            1px solid #dceee7;

          border-radius: 18px;

          padding: 45px 30px;

          text-align: center;

          box-shadow:
            0 8px 25px rgba(16,24,40,.04);
        }

        .resolved-icon {
          width: 58px;
          height: 58px;

          margin:
            0 auto 15px;

          border-radius: 50%;

          display: flex;

          align-items: center;
          justify-content: center;

          background: #ecfdf3;

          color: #087443;

          font-size: 25px;

          border:
            1px solid #c6f0d9;
        }

        .resolved-card h3 {
          margin: 0;

          font-family:
            "Montserrat",
            "Inter",
            sans-serif;

          font-size: 21px;

          font-weight: 800;
        }

        .resolved-card p {
          color: #667085;

          font-size: 12px;

          margin:
            8px 0 20px;
        }

        /* =========================
           DASHBOARD
        ========================= */

        .dashboard-grid {
          display: grid;

          grid-template-columns:
            1.45fr 1fr;

          gap: 17px;
        }

        .activity {
          display: flex;

          gap: 12px;

          padding:
            16px 22px;

          border-bottom:
            1px solid #f0f2f5;

          align-items: center;

          transition: .2s ease;
        }

        .activity:hover {
          background: #fafcfd;
        }

        .activity:last-child {
          border-bottom: 0;
        }

        .activity-dot {
          width: 8px;
          height: 8px;

          border-radius: 50%;

          background: #12b76a;

          box-shadow:
            0 0 0 4px rgba(18,183,106,.09);
        }

        .activity-dot.warning {
          background: #f79009;

          box-shadow:
            0 0 0 4px rgba(247,144,9,.09);
        }

        .activity-text {
          flex: 1;

          font-size: 12px;
        }

        .activity-time {
          color: #98a2b3;

          font-size: 10px;
        }

        /* =========================
           MOBILE
        ========================= */

        @media (max-width: 1000px) {

          .sidebar {
            width: 78px;
          }

          .brand-text,
          .nav-title,
          .nav-button span:not(.nav-icon),
          .sidebar-bottom,
          .review-count {
            display: none;
          }

          .brand {
            justify-content: center;

            padding-left: 0;
            padding-right: 0;
          }

          .brand-line {
            display: none;
          }

          .main {
            margin-left: 78px;
          }

          .content {
            padding: 25px;
          }

          .stats {
            grid-template-columns:
              repeat(2, 1fr);
          }

          .comparison,
          .dashboard-grid {
            grid-template-columns: 1fr;
          }

          .verification-summary {
            grid-template-columns:
              repeat(2, 1fr);
          }

          .system-chip {
            display: none;
          }
        }

        @media (max-width: 900px) {

          .email-category {
            display: none;
          }

        }

        @media (max-width: 650px) {

          .topbar {
            padding:
              0 20px;
          }

          .topbar-left h2 {
            font-size: 17px;
          }

          .topbar-left p {
            display: none;
          }

          .breadcrumb {
            display: none;
          }

          .content {
            padding:
              22px 16px;
          }

          .stats {
            grid-template-columns:
              1fr 1fr;

            gap: 9px;
          }

          .email-row {
            align-items: flex-start;

            flex-wrap: wrap;

            padding:
              16px 18px;
          }

          .email-main {
            min-width:
              calc(100% - 60px);
          }

          .email-actions {
            width: 100%;

            margin-left: 59px;
          }

          .email-actions button {
            flex: 1;
          }

          .verification-header {
            padding: 22px;

            align-items: flex-start;

            gap: 20px;
          }

          .verification-header h1 {
            font-size: 21px;
          }

          .confidence {
            min-width: 90px;
          }

          .confidence strong {
            font-size: 23px;
          }

          .verification-summary {
            grid-template-columns:
              1fr 1fr;
          }

          .review-grid,
          .mismatch-content {
            grid-template-columns: 1fr;
          }

          .actions {
            flex-wrap: wrap;
          }

          .case-label {
            position: static;

            display: inline-block;

            margin-bottom: 15px;
          }

          .correct-row {
            flex-direction: column;
          }
        }

      `}</style>

      {/* =========================
          SIDEBAR
      ========================= */}

      <aside className="sidebar">

        <div className="brand">

          <div className="brand-icon">
            S
          </div>

          <div className="brand-text">

            <h1>
              SHIPCHECK
            </h1>

            <span>
              AI DOCUMENT CONTROL
            </span>

          </div>

          <div className="brand-line"></div>

        </div>

        <div className="nav-title">
          Workspace
        </div>

        <button
          className={`nav-button ${
            page === "inbox" ? "active" : ""
          }`}
          onClick={() => setPage("inbox")}
        >

          <span className="nav-icon">
            ✉
          </span>

          <span>
            Inbox
          </span>

        </button>

        <button
          className={`nav-button ${
            page === "verification" ? "active" : ""
          }`}
          onClick={() => setPage("verification")}
        >

          <span className="nav-icon">
            ▣
          </span>

          <span>
            Verification
          </span>

        </button>

        <button
          className={`nav-button ${
            page === "review" ? "active" : ""
          }`}
          onClick={() => setPage("review")}
        >

          <span className="nav-icon">
            ⚠
          </span>

          <span>
            Human Review
          </span>

          {hasPendingReview && (
            <span className="review-count">
              01
            </span>
          )}

        </button>

        <button
          className={`nav-button ${
            page === "dashboard" ? "active" : ""
          }`}
          onClick={() => setPage("dashboard")}
        >

          <span className="nav-icon">
            ▥
          </span>

          <span>
            Dashboard
          </span>

        </button>

        <div className="sidebar-bottom">

          <div className="online">

            <span className="dot"></span>

            <div className="online-text">

              <strong>
                {apiOnline ? "AI System Online" : "AI System Offline"}
              </strong>

              <small>
                {apiOnline ? "Backend connected" : apiError || "Checking backend"}
              </small>

            </div>

          </div>

        </div>

      </aside>

      {/* =========================
          MAIN
      ========================= */}

      <main className="main">

        <header className="topbar">

          <div className="topbar-left">

            <div className="breadcrumb">

              <span>
                SHIPCHECK
              </span>

              <span>
                /
              </span>

              <span className="breadcrumb-active">
                {pageTitle[page]}
              </span>

            </div>

            <h2>
              {pageTitle[page]}
            </h2>

            <p>
              {pageSubtitle[page]}
            </p>

          </div>

          <div className="topbar-right">

            <div className="system-chip">

              <span className="system-chip-dot"></span>

              AI ONLINE

            </div>

            <div className="avatar">
              OP
            </div>

          </div>

        </header>

        <section className="content">

          {/* =========================
              INBOX
          ========================= */}

          {page === "inbox" && (
            <>

              <div className="page-heading">

                <div>

                  <h1>
                    Inbox
                  </h1>

                  <p>
                    AI-classified shipping emails ready for action.
                  </p>

                </div>

                <span className="badge badge-success">
                  ● AI Classification Active
                </span>

              </div>

              <div className="stats">

                <div className="stat-card">

                  <div className="stat-top">

                    <span className="stat-label">
                      Emails Processed
                    </span>

                    <div className="stat-icon">
                      ✉
                    </div>

                  </div>

                  <div className="stat-number">
                    {checkedValues.length}
                  </div>

                </div>

                <div className="stat-card">

                  <div className="stat-top">

                    <span className="stat-label">
                      Comparisons
                    </span>

                    <div className="stat-icon">
                      ▣
                    </div>

                  </div>

                  <div className="stat-number">
                    {checkedComparisonCount}
                  </div>

                </div>

                <div className="stat-card">

                  <div className="stat-top">

                    <span className="stat-label">
                      Matched
                    </span>

                    <div className="stat-icon">
                      ✓
                    </div>

                  </div>

                  <div className="stat-number">
                    {checkedMatchedCount}
                  </div>

                </div>

                <div className="stat-card">

                  <div className="stat-top">

                    <span className="stat-label">
                      Needs Review
                    </span>

                    <div className="stat-icon">
                      ⚠
                    </div>

                  </div>

                  <div className="stat-number">
                    {checkedReviewCount}
                  </div>

                </div>

              </div>

              <div className="panel">

                <div className="panel-header">

                  <div>

                    <div className="inbox-panel-header">

                      <h3>
                        Classified Emails
                      </h3>

                      <span className="inbox-count">
                        {emails.length}
                      </span>

                    </div>

                    <span>
                      AI has categorized incoming messages
                    </span>

                  </div>

                  <span className="inbox-panel-meta">
                    Today · {emails.length} messages
                  </span>

                </div>

                {emails.map((email) => {
                  const result = checkedResults[email.email_id];
                  const needsAction =
                    result && (result.needs_review || result.mismatch_found);
                  const isChecking = loadingEmailId === email.email_id;

                  return (
                    <div
                      className={`email-row ${
                        needsAction
                          ? "needs-action"
                          : result
                          ? "classified"
                          : ""
                      }`}
                      key={email.email_id}
                    >

                      {needsAction && (
                        <span className="email-priority"></span>
                      )}

                      <div className="email-icon">
                        {result?.category === "BL_COMPARISON"
                          ? "▣"
                          : result?.category === "SI_REQUEST"
                          ? "↗"
                          : result?.category === "INVOICE_QUERY"
                          ? "▤"
                          : "✉"}
                      </div>

                      <div className="email-main">

                        <h4>
                          {email.subject}
                        </h4>

                        <p>
                          {email.from || email.from_ || "Unknown sender"} · {email.email_id}
                        </p>

                      </div>

                      <span className="email-category">
                        {categoryLabel(result?.category)}
                      </span>

                      {result ? (
                        <span
                          className={`badge ${
                            needsAction
                              ? "badge-warning"
                              : "badge-success"
                          }`}
                        >
                          {result.needs_review
                            ? "Needs review"
                            : result.mismatch_found
                            ? `${result.mismatches?.length || 1} mismatch`
                            : "Classified"}
                        </span>
                      ) : (
                        <span className="badge badge-neutral">
                          Pending
                        </span>
                      )}

                      <div className="email-actions">

                        <button
                          className={
                            needsAction || result?.category === "BL_COMPARISON"
                              ? "primary-btn"
                              : "secondary-btn"
                          }
                          onClick={() => checkEmail(email)}
                          disabled={isChecking}
                        >
                          {isChecking
                            ? "Checking..."
                            : result?.category === "BL_COMPARISON"
                            ? "Review"
                            : "View"}
                        </button>

                      </div>

                    </div>
                  );
                })}

              </div>

            </>
          )}

          {/* =========================
              VERIFICATION
          ========================= */}

          {page === "verification" && (
            <>

              <div className="verification-header">

                <div>

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 9px",
                      borderRadius: 20,
                      background: "rgba(77,224,191,.1)",
                      border:
                        "1px solid rgba(77,224,191,.18)",
                      color: "#4de0bf",
                      fontSize: 9,
                      fontWeight: 800,
                      marginBottom: 12,
                      letterSpacing: ".5px",
                    }}
                  >
                    ● AI VERIFICATION COMPLETE
                  </div>

                  <h1>
                    {mockData.email.subject || "Draft BL Verification"}
                  </h1>

                  <p>
                    Compare Shipping Instruction with the Draft Bill of Lading
                  </p>

                  <p>
                    {mockData.email.sender} ·{" "}
                    {mockData.email.date} ·{" "}
                    {mockData.email_id}
                  </p>

                </div>

                <div className="confidence">

                  <small>
                    AI CONFIDENCE
                  </small>

                  <strong>
                    {Math.round((mockData.confidence || 0.96) * 100)}%
                  </strong>

                  <div className="confidence-bar">

                    <div className="confidence-fill"></div>

                  </div>

                </div>

              </div>

              <div className="verification-summary">

                <div className="verification-stat">

                  <div className="verification-stat-label">
                    Fields Checked
                  </div>

                  <div className="verification-stat-main">

                    <div className="verification-stat-value">
                      7
                    </div>

                    <span className="match-indicator">
                      COMPLETE
                    </span>

                  </div>

                </div>

                <div className="verification-stat">

                  <div className="verification-stat-label">
                    Matching
                  </div>

                  <div className="verification-stat-value success">
                    {matchingCount}
                  </div>

                </div>

                <div className="verification-stat">

                  <div className="verification-stat-label">
                    Mismatch
                  </div>

                  <div className="verification-stat-value warning">
                    {discrepancyCount}
                  </div>

                </div>

                <div className="verification-stat">

                  <div className="verification-stat-label">
                    Status
                  </div>

                  <div
                    className={
                      `verification-stat-value ${
                        discrepancyCount === 0
                          ? "success"
                          : "warning"
                      }`
                    }
                    style={{
                      fontSize: 14,
                    }}
                  >
                    {discrepancyCount === 0
                      ? "Verified"
                      : "Review Required"}
                  </div>

                </div>

              </div>

              <div className="comparison-wrapper">

                <div className="comparison-label">

                  SI

                  <span>
                    VS
                  </span>

                  DRAFT BL

                </div>

                <div className="comparison">

                  <div className="document-card">

                    <div className="document-title">

                      Shipping Instruction

                      <span>
                        REFERENCE
                      </span>

                    </div>

                    {fields.map(([key, label]) => (

                      <div
                        className="field"
                        key={key}
                      >

                        <div className="field-label">
                          {label}
                        </div>

                        <div className="field-value">

                          {formatValue(
                            key,
                            mockData.si[key]
                          )}

                          {isMismatch(key) ? (

                            <span className="mismatch-indicator">
                              MISMATCH
                            </span>

                          ) : (

                            <span className="match-indicator">
                              ✓ MATCH
                            </span>

                          )}

                        </div>

                      </div>

                    ))}

                  </div>

                  <div className="document-card">

                    <div className="document-title">

                      Draft Bill of Lading

                      <span>
                        DOCUMENT
                      </span>

                    </div>

                    {fields.map(([key, label]) => (

                      <div
                        className="field"
                        key={key}

                        style={
                          isMismatch(key)
                            ? {
                                background:
                                  "linear-gradient(90deg,#fff4e8,#fffaf5)",

                                borderLeft:
                                  "4px solid #f79009",
                              }
                            : {}
                        }
                      >

                        <div className="field-label">
                          {label}
                        </div>

                        <div className="field-value">

                          {formatValue(
                            key,
                            currentBL[key]
                          )}

                          {isMismatch(key) ? (

                            <span className="mismatch-indicator">
                              ⚠ DIFFERENT
                            </span>

                          ) : (

                            <span className="match-indicator">
                              ✓ MATCH
                            </span>

                          )}

                        </div>

                      </div>

                    ))}

                  </div>

                </div>

              </div>

              {discrepancyCount > 0 ? (

                <div className="mismatch-card">

                  <div className="mismatch-title">
                    ⚠ {discrepancyCount} discrepancy detected
                  </div>

                  <div className="mismatch-field-name">
                    Container Count
                  </div>

                  <p
                    style={{
                      color: "#7c2d12",
                      fontSize: 12,
                      marginTop: 6,
                      marginBottom: 0,
                    }}
                  >
                    The AI found a difference between the Shipping
                    Instruction and Draft Bill of Lading.
                  </p>

                  <div className="mismatch-content">

                    <div className="value-box">

                      <small>
                        SHIPPING INSTRUCTION
                      </small>

                      <strong>
                        {mockData.si.container_count} containers
                      </strong>

                    </div>

                    <div className="value-box">

                      <small>
                        DRAFT BILL OF LADING
                      </small>

                      <strong>
                        {currentBL.container_count} containers
                      </strong>

                    </div>

                  </div>

                  <div className="review-action">

                    <button
                      className="primary-btn"
                      onClick={() => setPage("review")}
                    >
                      Send to Human Review →
                    </button>

                  </div>

                </div>

              ) : (

                <div
                  className="resolved-card"
                  style={{
                    marginTop: 18,
                  }}
                >

                  <div className="resolved-icon">
                    ✓
                  </div>

                  <h3>
                    No mismatch detected
                  </h3>

                  <p>
                    All seven shipping document fields now match.
                  </p>

                </div>

              )}

            </>
          )}

          {/* =========================
              HUMAN REVIEW
          ========================= */}

          {page === "review" && (
            <>

              <div className="page-heading">

                <div>

                  <h1>
                    Human Review
                  </h1>

                  <p>
                    Cases where AI needs an operator decision.
                  </p>

                </div>

                {hasPendingReview ? (

                  <span className="badge badge-warning">
                    1 Case Pending
                  </span>

                ) : (

                  <span className="badge badge-success">
                    ✓ No Pending Cases
                  </span>

                )}

              </div>

              {hasPendingReview ? (

                <div className="review-card">

                  <div className="case-label">
                    CASE #001
                  </div>

                  <div className="review-alert">

                    <strong>
                      ⚠ Human Review Required
                    </strong>

                    The AI detected a discrepancy that requires
                    human confirmation before the document is finalized.

                  </div>

                  <h3>
                    Container Count Mismatch
                  </h3>

                  <p>
                    {mockData.email.subject || "Draft BL Verification"} · {mockData.email_id}
                  </p>

                  <div className="review-grid">

                    <div className="review-box">

                      <small>
                        Shipping Instruction
                      </small>

                      <strong>
                        3 containers
                      </strong>

                    </div>

                    <div className="review-box warning-box">

                      <small>
                        Draft Bill of Lading
                      </small>

                      <strong>
                        {currentBL.container_count} containers
                      </strong>

                    </div>

                    <div className="review-box">

                      <small>
                        AI Confidence
                      </small>

                      <strong>
                        96%
                      </strong>

                    </div>

                    <div className="review-box">

                      <small>
                        Reason
                      </small>

                      <strong>
                        Values do not match
                      </strong>

                    </div>

                  </div>

                  <div className="actions">

                    <button
                      className="primary-btn approve"
                      onClick={handleApprove}
                    >
                      ✓ Approve
                    </button>

                    <button
                      className="secondary-btn"
                      onClick={handleCorrectValue}
                    >
                      Correct Value
                    </button>

                    <button
                      className="primary-btn reject"
                      onClick={handleReject}
                    >
                      Reject
                    </button>

                  </div>

                  {showCorrect && (

                    <div className="correct-section">

                      <label>
                        Enter the correct container count
                      </label>

                      <div className="correct-row">

                        <input
                          className="correct-input"
                          type="number"
                          min="1"
                          value={correctValue}
                          onChange={(e) =>
                            setCorrectValue(e.target.value)
                          }
                        />

                        <button
                          className="primary-btn"
                          onClick={handleCorrectValue}
                        >
                          Save Correction
                        </button>

                      </div>

                    </div>

                  )}

                </div>

              ) : (

                <div className="resolved-card">

                  <div className="resolved-icon">

                    {reviewStatus === "approved"
                      ? "✓"
                      : reviewStatus === "rejected"
                      ? "×"
                      : "✓"}

                  </div>

                  <h3>

                    {reviewStatus === "approved"
                      ? "Case Approved"
                      : reviewStatus === "rejected"
                      ? "Case Rejected"
                      : "Case Corrected"}

                  </h3>

                  <p>
                    Case #001 has been resolved and no longer
                    requires human review.
                  </p>

                  <button
                    className="primary-btn"
                    onClick={() => setPage("inbox")}
                  >
                    Back to Inbox
                  </button>

                </div>

              )}

            </>
          )}

          {/* =========================
              DASHBOARD
          ========================= */}

          {page === "dashboard" && (
            <>

              <div className="page-heading">

                <div>

                  <h1>
                    Operations Overview
                  </h1>

                  <p>
                    Shipping document verification performance.
                  </p>

                </div>

                <span className="badge badge-success">
                  System Healthy
                </span>

              </div>

              <div className="stats">

                <div className="stat-card">

                  <div className="stat-label">
                    Emails Processed
                  </div>

                  <div className="stat-number">
                    48
                  </div>

                </div>

                <div className="stat-card">

                  <div className="stat-label">
                    Comparison Requests
                  </div>

                  <div className="stat-number">
                    21
                  </div>

                </div>

                <div className="stat-card">

                  <div className="stat-label">
                    Documents Matched
                  </div>

                  <div className="stat-number">
                    {reviewStatus === "corrected" ? 16 : 15}
                  </div>

                </div>

                <div className="stat-card">

                  <div className="stat-label">
                    Discrepancies
                  </div>

                  <div className="stat-number">
                    {reviewStatus === "pending" ? 4 : 3}
                  </div>

                </div>

              </div>

              <div className="dashboard-grid">

                <div className="panel">

                  <div className="panel-header">

                    <div>

                      <h3>
                        Recent Activity
                      </h3>

                      <span>
                        Latest verification events
                      </span>

                    </div>

                  </div>

                  <div className="activity">

                    <span className="activity-dot"></span>

                    <span className="activity-text">
                      Email #001 · Documents match
                    </span>

                    <span className="activity-time">
                      2 min ago
                    </span>

                  </div>

                  <div className="activity">

                    <span className="activity-dot warning"></span>

                    <span className="activity-text">
                      Email #002 · Container count mismatch
                    </span>

                    <span className="activity-time">
                      8 min ago
                    </span>

                  </div>

                  <div className="activity">

                    <span className="activity-dot"></span>

                    <span className="activity-text">
                      Email #003 · Documents match
                    </span>

                    <span className="activity-time">
                      14 min ago
                    </span>

                  </div>

                  <div className="activity">

                    <span
                      className={
                        reviewStatus === "pending"
                          ? "activity-dot warning"
                          : "activity-dot"
                      }
                    ></span>

                    <span className="activity-text">

                      {reviewStatus === "pending"
                        ? "Email #004 · Human review required"
                        : reviewStatus === "approved"
                        ? "Email #004 · Human review approved"
                        : reviewStatus === "rejected"
                        ? "Email #004 · Review case rejected"
                        : "Email #004 · Value corrected"}

                    </span>

                    <span className="activity-time">
                      Just now
                    </span>

                  </div>

                </div>

                <div className="panel">

                  <div className="panel-header">

                    <div>

                      <h3>
                        Verification Status
                      </h3>

                      <span>
                        Today's documents
                      </span>

                    </div>

                  </div>

                  <div style={{ padding: 25 }}>

                    <div style={{ marginBottom: 20 }}>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          marginBottom: 8,
                        }}
                      >

                        <span>
                          Matched
                        </span>

                        <strong>
                          {reviewStatus === "corrected"
                            ? 16
                            : 15}
                        </strong>

                      </div>

                      <div
                        style={{
                          height: 9,
                          background: "#ecfdf3",
                          borderRadius: 20,
                        }}
                      >

                        <div
                          style={{
                            width:
                              reviewStatus === "corrected"
                                ? "76%"
                                : "71%",
                            height: "100%",
                            background: "#12b76a",
                            borderRadius: 20,
                          }}
                        />

                      </div>

                    </div>

                    <div style={{ marginBottom: 20 }}>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          marginBottom: 8,
                        }}
                      >

                        <span>
                          Discrepancies
                        </span>

                        <strong>
                          {reviewStatus === "pending"
                            ? 4
                            : 3}
                        </strong>

                      </div>

                      <div
                        style={{
                          height: 9,
                          background: "#fff7ed",
                          borderRadius: 20,
                        }}
                      >

                        <div
                          style={{
                            width:
                              reviewStatus === "pending"
                                ? "19%"
                                : "14%",
                            height: "100%",
                            background: "#f79009",
                            borderRadius: 20,
                          }}
                        />

                      </div>

                    </div>

                    <div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          marginBottom: 8,
                        }}
                      >

                        <span>
                          Human Review
                        </span>

                        <strong>
                          {reviewStatus === "pending" ? 2 : 0}
                        </strong>

                      </div>

                      <div
                        style={{
                          height: 9,
                          background: "#eef4ff",
                          borderRadius: 20,
                        }}
                      >

                        <div
                          style={{
                            width:
                              reviewStatus === "pending"
                                ? "10%"
                                : "0%",
                            height: "100%",
                            background: "#2e90fa",
                            borderRadius: 20,
                          }}
                        />

                      </div>

                    </div>

                  </div>

                </div>

              </div>

            </>

          )}

        </section>

      </main>

    </div>
  );
}

export default App;
