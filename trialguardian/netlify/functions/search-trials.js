exports.handler = async function(event) {
  const params = event.queryStringParameters || {};
  const {
    condition = "",
    latitude = "45.5017",
    longitude = "-73.5673",
    radius = "100",
    phase = "",
    rows = "20",
    page_token = ""
  } = params;

  const radiusMiles = Math.round(Number(radius) * 0.621371);

  let url = `https://clinicaltrials.gov/api/v2/studies?format=json&pageSize=${rows}&filter.overallStatus=RECRUITING&sort=@relevance`;

  if (condition) url += `&query.cond=${encodeURIComponent(condition)}`;
  url += `&filter.geo=distance(${latitude},${longitude},${radiusMiles}mi)`;
  if (phase) url += `&filter.phase=${encodeURIComponent(phase)}`;
  if (page_token) url += `&pageToken=${page_token}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    const studies = (data.studies || []).map(s => {
      const proto = s.protocolSection || {};
      const id = proto.identificationModule || {};
      const stat = proto.statusModule || {};
      const desc = proto.descriptionModule || {};
      const design = proto.designModule || {};
      const contacts = proto.contactsLocationsModule || {};
      const eligibility = proto.eligibilityModule || {};
      const sponsor = proto.sponsorCollaboratorsModule || {};
      const locations = contacts.locations || [];
      const loc = locations.find(l => l.country === 'Canada') || locations[0] || {};
      const centralContacts = contacts.centralContacts || [];
      const contact = centralContacts[0] || {};
      const phases = design.phases || [];
      const phaseLabel = phases.length > 0 ? phases.map(p => p.replace('PHASE','Phase ').replace('_',' ')).join(', ') : 'N/A';

      return {
        nctId: id.nctId || '',
        title: id.briefTitle || '',
        summary: desc.briefSummary || '',
        status: stat.overallStatus || '',
        phase: phaseLabel,
        firstPostedDate: stat.studyFirstPostDateStruct && stat.studyFirstPostDateStruct.date ? stat.studyFirstPostDateStruct.date : '',
        enrollment: design.enrollmentInfo ? design.enrollmentInfo.count : null,
        conditions: proto.conditionsModule ? (proto.conditionsModule.conditions || []).join(', ') : '',
        sponsor: sponsor.leadSponsor ? sponsor.leadSponsor.name : '',
        facility: loc.facility || '',
        city: loc.city || '',
        country: loc.country || '',
        contact: { name: contact.name || '', phone: contact.phone || '', email: contact.email || '' },
        eligibility: { minAge: eligibility.minimumAge || '', maxAge: eligibility.maximumAge || '' },
        url: `https://clinicaltrials.gov/study/${id.nctId}`
      };
    });

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ total: data.totalCount || studies.length, nextPageToken: data.nextPageToken || null, studies })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
