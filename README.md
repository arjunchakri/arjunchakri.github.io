# arjunchakri.github.io

[![Docker Image CI](https://github.com/arjunchakri/arjunchakri.github.io/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/arjunchakri/arjunchakri.github.io/actions/workflows/docker-publish.yml)
[![pages-build-deployment](https://github.com/arjunchakri/arjunchakri.github.io/actions/workflows/pages/pages-build-deployment/badge.svg)](https://github.com/arjunchakri/arjunchakri.github.io/actions/workflows/pages/pages-build-deployment)

This repository contains the source code for my personal portfolio website. 

## About The Project

This website serves as my personal portfolio to showcase my projects, skills, and experience.

### Built With

*   HTML5
*   CSS3
*   Google's Material Design

## Docker Support

For easy deployment and a consistent running environment, this website is packaged as a Docker image and is available on Docker Hub.

### Prerequisites

*   You must have Docker installed on your machine.

### Running the Container

1.  Pull the latest multi-platform image from Docker Hub:
    ```sh
    docker pull arjunchakri/arjunchakri.github.io:latest
    ```
2.  Run the image in a container, mapping a local port to the container's port 80:
    ```sh
    docker run -d -p 8080:80 arjunchakri/arjunchakri.github.io
    ```
3.  Once the container is running, open your favorite web browser and navigate to `http://localhost:8080` to see the website.

## Continuous Integration

This project uses GitHub Actions for continuous integration. Every push to the `master` branch triggers a workflow that:

1.  Builds a multi-platform Docker image compatible with both `linux/amd64` (standard Intel/AMD CPUs) and `linux/arm64` (Apple Silicon, Raspberry Pi, etc.).
2.  Pushes the new image to [Docker Hub](https://hub.docker.com/r/arjunchakri/arjunchakri.github.io).

## Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion to improve this project, please fork the repository and create a pull request. You can also simply open an issue with the tag "enhancement". And don't forget to give the project a star! Thanks!

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request
