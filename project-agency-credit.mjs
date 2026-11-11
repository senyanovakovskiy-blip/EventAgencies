export function creditProjectsToAgencies(projects,agencies){
 const names=new Map(agencies.map(agency=>[agency.slug,agency.name]));
 return projects.map(project=>({...project,agencyName:names.get(project.agencySlug)||'не указана'}));
}
