  useEffect(() => {
    const tabParam = router.query.tab as string | undefined;
    if (tabParam === "ortho" || tabParam === "ortho_card") {
      setActiveTab("ortho_card");
    } else if (tabParam === "patient_history") {
      setActiveTab("patient_history");
    } else if (tabParam === "appointments") {
      setActiveTab("appointments");
    } else if (tabParam === "visit_card") {
      setActiveTab("visit_card");
    }
  }, [router.query.tab]);
