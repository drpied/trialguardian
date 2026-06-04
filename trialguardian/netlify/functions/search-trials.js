// ============================================================
// TRIALGUARDIAN — Netlify Function
// Proxies ClinicalTrials.gov API v2
// No API key required — completely free
// ============================================================

exports.handler = async function(event) {
  const params = event.queryStringParameters || {};
  const {
    condition = "",
    latitude = "45.5017",
    longitude = "-73.5673",
    radius = "100",
    phase = "",
    rows = "20",
    page_token = "",
    sort = "firstPostedDate"
  } = params;

  // Base URL
  let url = `https://clinicaltrials.gov/api/v2/studies?format=json&pageSize=${rows}&filter.overallStatus=RECRUITING`;

  // Condition — plain language, Claude-interpreted or direct
  if (condition) url += `&query.cond=${encodeURIComponent(condition)}`;

  // Geo filter — distance in km converted to miles for the API
  const radiusMiles = Math.round(Number(radius) * 0.621371);
  url += `&filter.geo=distance(${latitude},${longitude},${radiusMiles}mi)`;

  // Phase filter
  if (phase) url += `&filter.phase=${encodeURIComponent(phase)}`;

  // Pagination
  if (page_token) url += `&pageToken=${page_token}`;

  // Sort — newest first by default
  url += `&sort=${sort}:desc`;

  // Fields we need — keeps response lean
  
       + `PrimaryCompletionDate,EnrollmentCount,Condition,Intervention,`
       + `LocationFacility,LocationCity,LocationState,LocationCountry,LocationStatus,`
       + `CentralContactName,CentralContactPhone,CentralContactEMail,`
       + `OverallOfficialName,OverallOfficialRole,`
       + `LeadSponsorName,ResponsiblePartyType,`
       + `MinimumAge,MaximumAge,Sex,HealthyVolunteers,EligibilityCriteria`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    // Normalize studies into clean flat objects
    const studies = (data.studies || []).map(s => {
      const proto = s.protocolSection || {};
      const id    = proto.identificationModule || {};
      const stat  = proto.statusModule || {};
      const desc  = proto.descriptionModule || {};
      const design = proto.designModule || {};
      const contacts = proto.contactsLocationsModule || {};
      const eligibility = proto.eligibilityModule || {};
      const sponsor = proto.sponsorCollaboratorsModule || {};

      // Get first recruiting location in Canada (or any location)
      const locations = contacts.locations || [];
      const canadaLoc = locations.find(l =>
        l.country === 'Canada' && l.status === 'RECRUITING'
      ) || locations[0] || {};

      // Central contact
      const centralContacts = contacts.centralContacts || [];
      const contact = centralContacts[0] || {};

      // Phase cleanup
      const phases = design.phases || [];
      const phaseLabel = phases.length > 0
        ? phases.join(', ').replace('PHASE', 'Phase ').replace('_', ' ')
        : 'N/A';

      return {
        nctId: id.nctId || '',
        title: id.briefTitle || '',
        summary: desc.briefSummary || '',
        status: stat.overallStatus || '',
        phase: phaseLabel,
        firstPostedDate: stat.studyFirstPostDateStruct?.date || '',
        startDate: stat.startDateStruct?.date || '',
        completionDate: stat.primaryCompletionDateStruct?.date || '',
        enrollment: design.enrollmentInfo?.count || null,
        conditions: (proto.conditionsModule?.conditions || []).join(', '),
        sponsor: sponsor.leadSponsor?.name || '',
        facility: canadaLoc.facility || '',
        city: canadaLoc.city || '',
        country: canadaLoc.country || '',
        contact: {
          name: contact.name || '',
          phone: contact.phone || '',
          email: contact.email || ''
        },
        eligibility: {
          minAge: eligibility.minimumAge || '',
          maxAge: eligibility.maximumAge || '',
          sex: eligibility.sex || 'ALL',
          healthyVolunteers: eligibility.healthyVolunteers || false,
          criteria: eligibility.eligibilityCriteria || ''
        },
        url: `https://clinicaltrials.gov/study/${id.nctId}`
      };
    });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        total: data.totalCount || 0,
        nextPageToken: data.nextPageToken || null,
        studies
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
