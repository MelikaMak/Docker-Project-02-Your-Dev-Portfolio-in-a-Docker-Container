import { profile, skills, projects } from "./data.js";

export default function App() {
  return (
    <main>
      <header>
        <h1>{profile.name}</h1>
        <p className="role">{profile.role}</p>
      </header>

      <section>
        <h2>About</h2>
        <p>{profile.about}</p>
      </section>

      <section>
        <h2>Skills</h2>
        <ul className="skills">
          {skills.map((skill) => (
            <li key={skill}>{skill}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Projects</h2>
        {projects.map((project) => (
          <article key={project.title} className="project">
            <h3>{project.title}</h3>
            <p>{project.description}</p>
            <a href={project.link}>View on GitHub</a>
          </article>
        ))}
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
          {" · "}
          <a href={profile.github}>GitHub</a>
        </p>
      </section>
    </main>
  );
}
