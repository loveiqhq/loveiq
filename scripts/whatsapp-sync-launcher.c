/*
 * What launchd runs for the WhatsApp sync, in place of the shell script, so that macOS sees
 * one stable program as responsible for reading WhatsApp's data.
 *
 * macOS asks "... would like to access data from other apps" when a program reads another
 * app's container, and an Allow there lasts only while that one process runs. The sync
 * starts a fresh process every run, so it asked again every run. Give THIS binary Full Disk
 * Access once and it never asks again: bash, node and sqlite3 run as its children, and macOS
 * holds the program launchd started responsible for everything under it.
 *
 * Build once, on the Mac that runs the sync:
 *   mkdir -p ~/.loveiq-brain/bin
 *   clang -O2 -o ~/.loveiq-brain/bin/loveiq-whatsapp-sync scripts/whatsapp-sync-launcher.c
 * Rebuilding changes its signature, and the Full Disk Access grant then has to be given again.
 * See "WhatsApp — read from this Mac" in docs/runbooks/COMPANY_BRAIN.md.
 */
#include <pwd.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;

int main(void) {
  const char *home = getenv("HOME");
  if (!home || !*home) {
    struct passwd *pw = getpwuid(getuid());
    home = pw ? pw->pw_dir : NULL;
  }
  if (!home) {
    fputs("loveiq-whatsapp-sync: no home directory\n", stderr);
    return 1;
  }
  char script[1024];
  int n = snprintf(script, sizeof script, "%s/.loveiq-brain/run-whatsapp-sync.sh", home);
  if (n < 0 || (size_t)n >= sizeof script) {
    fputs("loveiq-whatsapp-sync: home path too long\n", stderr);
    return 1;
  }
  char *argv[] = {"/bin/bash", script, NULL};
  pid_t pid;
  int rc = posix_spawn(&pid, argv[0], NULL, NULL, argv, environ);
  if (rc != 0) {
    fprintf(stderr, "loveiq-whatsapp-sync: could not start %s (%d)\n", script, rc);
    return 1;
  }
  int status;
  if (waitpid(pid, &status, 0) < 0) {
    perror("loveiq-whatsapp-sync: waitpid");
    return 1;
  }
  return WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);
}
